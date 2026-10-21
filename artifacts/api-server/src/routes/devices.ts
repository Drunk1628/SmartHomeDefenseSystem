
import { Router, type IRouter } from "express";
import {
  asc,
  eq,
  and,
  inArray,
  or,
  type SQL,
} from "drizzle-orm";
import {
  db,
  devices,
  homes,
  homeMembers,
  devicePermissions,
  auditLogs,
} from "@workspace/db";

const router: IRouter = Router();

const trustStatusMap = {
  Trusted: "trusted",
  Unknown: "untrusted",
  Restricted: "quarantined",
} as const;

type DisplayTrust = keyof typeof trustStatusMap;


 // GET /devices
 // Owners and home members can view devices in their homes.
 // Other users need explicit permission for an individual device.
router.get("/devices", async (req, res, next) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    // Find homes owned by this user.
    const ownedHomes = await db
      .select({ id: homes.id })
      .from(homes)
      .where(eq(homes.ownerUserId, userId));

    // Find homes this user has joined.
    const memberHomes = await db
      .select({ id: homeMembers.homeId })
      .from(homeMembers)
      .where(eq(homeMembers.userId, userId));

    // Combine owned and joined homes without duplicate IDs.
    const homeIds = [
      ...new Set([
        ...ownedHomes.map((home) => home.id),
        ...memberHomes.map((home) => home.id),
      ]),
    ];

    // Find devices explicitly shared with this user.
    const grantedDevices = await db
      .select({ id: devicePermissions.deviceId })
      .from(devicePermissions)
      .where(
        and(
          eq(devicePermissions.userId, userId),
          inArray(devicePermissions.permission, [
            "view",
            "control",
            "manage",
          ]),
        ),
      );

    const deviceIds = grantedDevices.map((item) => item.id);

    // No home access and no device permissions means no devices.
    if (homeIds.length === 0 && deviceIds.length === 0) {
      res.json([]);
      return;
    }

    const conditions: SQL[] = [];

    if (homeIds.length > 0) {
      conditions.push(inArray(devices.homeId, homeIds));
    }

    if (deviceIds.length > 0) {
      conditions.push(inArray(devices.id, deviceIds));
    }

    const rows = await db
      .select()
      .from(devices)
      .where(or(...conditions))
      .orderBy(asc(devices.id));

    const result = rows.map((device) => ({
      id: String(device.id),
      name: device.deviceName,
      category: device.deviceType,
      room: device.room ?? "",
      trust:
        device.trustStatus === "trusted"
          ? "Trusted"
          : device.trustStatus === "quarantined"
            ? "Restricted"
            : "Unknown",
      ip: device.ipAddress ?? "",
      seen: device.lastSeenAt
        ? new Date(device.lastSeenAt).toLocaleString()
        : "Never",
      firmware: device.firmwareVersion ?? "Not provided",
      online: device.connectionStatus === "online",
      quarantined: device.trustStatus === "quarantined",
    }));

    res.json(result);
  } catch (error) {
    next(error);
  }
});


// PATCH /devices/:id/trust
// Owners or users with control/manage permission may change trust.
router.patch("/devices/:id/trust", async (req, res, next) => {
  try {
    const userId = req.session.userId;
    const id = Number(req.params.id);
    const trust = req.body?.trust;

    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!Number.isSafeInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid device ID" });
      return;
    }

    if (
      typeof trust !== "string" ||
      !Object.prototype.hasOwnProperty.call(trustStatusMap, trust)
    ) {
      res.status(400).json({ error: "Invalid trust status" });
      return;
    }

    const databaseTrustStatus = trustStatusMap[trust as DisplayTrust];

    const [existing] = await db
      .select({
        id: devices.id,
        deviceName: devices.deviceName,
        trustStatus: devices.trustStatus,
        ownerUserId: homes.ownerUserId,
      })
      .from(devices)
      .innerJoin(homes, eq(devices.homeId, homes.id))
      .where(eq(devices.id, id))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Device not found" });
      return;
    }

    const isOwner = existing.ownerUserId === userId;

    if (!isOwner) {
      const [permission] = await db
        .select({ permission: devicePermissions.permission })
        .from(devicePermissions)
        .where(
          and(
            eq(devicePermissions.userId, userId),
            eq(devicePermissions.deviceId, id),
            inArray(devicePermissions.permission, ["control", "manage"]),
          ),
        )
        .limit(1);

      if (!permission) {
        res.status(403).json({
          error: "You do not have permission to change this device.",
        });
        return;
      }
    }

    const result = await db.transaction(async (tx) => {
      const [updatedDevice] = await tx
        .update(devices)
        .set({
          trustStatus: databaseTrustStatus,
          updatedAt: new Date(),
        })
        .where(eq(devices.id, id))
        .returning({
          id: devices.id,
          trustStatus: devices.trustStatus,
        });

      await tx.insert(auditLogs).values({
        action:
          databaseTrustStatus === "quarantined"
            ? "device.quarantined"
            : "device.trust_updated",
        resourceType: "device",
        resourceId: String(id),
        outcome: "success",
        details: {
          deviceName: existing.deviceName,
          previousTrustStatus: existing.trustStatus,
          newTrustStatus: updatedDevice.trustStatus,
          changedByUserId: userId,
        },
      });

      return updatedDevice;
    });

    res.json({
      id: String(result.id),
      trust,
      message: "Device trust status updated successfully",
    });
  } catch (error) {
    next(error);
  }
});

// POST /devices
// A user may add a device only to a home they own.
router.post("/devices", async (req, res, next) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const { name, category, room, ip, firmware, online } = req.body ?? {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof category !== "string" ||
      !category.trim() ||
      typeof room !== "string" ||
      !room.trim() ||
      typeof ip !== "string" ||
      !ip.trim()
    ) {
      res.status(400).json({
        error: "Name, category, room, and IP are required",
      });
      return;
    }

    const ipAddress = ip.trim();

    const validIp =
      /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/.test(
        ipAddress,
      );

    if (!validIp) {
      res.status(400).json({ error: "Invalid IPv4 address" });
      return;
    }

    let homeId: number;

    if (req.body?.homeId !== undefined) {
      const requestedHomeId = Number(req.body.homeId);

      if (
        !Number.isSafeInteger(requestedHomeId) ||
        requestedHomeId <= 0
      ) {
        res.status(400).json({ error: "Invalid home ID" });
        return;
      }

      const [ownedHome] = await db
        .select({ id: homes.id })
        .from(homes)
        .where(
          and(
            eq(homes.id, requestedHomeId),
            eq(homes.ownerUserId, userId),
          ),
        )
        .limit(1);

      if (!ownedHome) {
        res.status(403).json({
          error: "You can only add devices to a home you own.",
        });
        return;
      }

      homeId = ownedHome.id;
    } else {
      const [ownedHome] = await db
        .select({ id: homes.id })
        .from(homes)
        .where(eq(homes.ownerUserId, userId))
        .orderBy(asc(homes.id))
        .limit(1);

      if (!ownedHome) {
        res.status(403).json({
          error: "You must own a home before adding devices.",
        });
        return;
      }

      homeId = ownedHome.id;
    }

    const [existingDevice] = await db
      .select({ id: devices.id })
      .from(devices)
      .where(eq(devices.ipAddress, ipAddress))
      .limit(1);

    if (existingDevice) {
      res.status(409).json({
        error: "That IP address is already assigned to a device",
      });
      return;
    }

    const [newDevice] = await db
      .insert(devices)
      .values({
        homeId,
        deviceName: name.trim(),
        deviceType: category.trim(),
        deviceIdentifier: ipAddress,
        room: room.trim(),
        ipAddress,
        firmwareVersion:
          typeof firmware === "string" && firmware.trim()
            ? firmware.trim()
            : null,
        trustStatus: "untrusted",
        connectionStatus: online === true ? "online" : "offline",
        lastSeenAt: online === true ? new Date() : null,
      })
      .returning();

    res.status(201).json({
      id: String(newDevice.id),
      name: newDevice.deviceName,
      category: newDevice.deviceType,
      room: newDevice.room ?? "",
      trust: "Unknown",
      ip: newDevice.ipAddress ?? "",
      seen: newDevice.lastSeenAt
        ? new Date(newDevice.lastSeenAt).toLocaleString()
        : "Never",
      firmware: newDevice.firmwareVersion ?? "Not provided",
      online: newDevice.connectionStatus === "online",
      quarantined: false,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
