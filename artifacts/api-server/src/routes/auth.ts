
import { Router, type IRouter } from "express";
import argon2 from "argon2";
import { eq } from "drizzle-orm";
import { db, users, homes } from "@workspace/db";

const authRouter: IRouter = Router();

const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const publicUser = (user: {
  id: number;
  email: string;
  displayName: string;
  accountStatus: string;
}) => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  accountStatus: user.accountStatus,
});

authRouter.post("/auth/register", async (req, res) => {
  try {
    const { email, password, displayName } = req.body ?? {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof displayName !== "string"
    ) {
      res.status(400).json({
        error: "Email, password, and display name are required.",
      });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = displayName.trim();

    if (!isValidEmail(normalizedEmail)) {
      res.status(400).json({ error: "Please enter a valid email address." });
      return;
    }

    if (password.length < 12) {
      res.status(400).json({
        error: "Password must be at least 12 characters long.",
      });
      return;
    }

    if (normalizedName.length < 2 || normalizedName.length > 100) {
      res.status(400).json({
        error: "Display name must be between 2 and 100 characters.",
      });
      return;
    }

    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existingUser) {
      res.status(409).json({ error: "An account with this email already exists." });
      return;
    }

    const passwordHash = await argon2.hash(password);

    const [newUser] = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        passwordHash,
        displayName: normalizedName,
      })
      .returning({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        accountStatus: users.accountStatus,
      });

    if (!newUser) {
      res.status(500).json({ error: "Unable to create account." });
      return;
    }

    res.status(201).json({
      message: "Account created successfully. Please log in.",
      user: publicUser(newUser),
    });
  } catch (error) {
    console.error("Registration failed:", error);
    res.status(500).json({ error: "Unable to create account." });
  }
});

authRouter.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    if (typeof email !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "Email and password are required." });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (
      !user ||
      user.accountStatus !== "active" ||
      !(await argon2.verify(user.passwordHash, password))
    ) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    // Regenerate the session to help prevent session fixation.
    req.session.regenerate((error) => {
      if (error) {
        console.error("Session regeneration failed:", error);
        res.status(500).json({ error: "Unable to start session." });
        return;
      }

      req.session.userId = user.id;

      req.session.save((saveError) => {
        if (saveError) {
          console.error("Session save failed:", saveError);
          res.status(500).json({ error: "Unable to start session." });
          return;
        }

        res.json({
          message: "Login successful.",
          user: publicUser(user),
        });
      });
    });
  } catch (error) {
    console.error("Login failed:", error);
    res.status(500).json({ error: "Unable to log in." });
  }
});

authRouter.get("/auth/me", async (req, res) => {
  try {
    if (!req.session.userId) {
      res.status(401).json({ error: "Not logged in." });
      return;
    }

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        accountStatus: users.accountStatus,
      })
      .from(users)
      .where(eq(users.id, req.session.userId))
      .limit(1);

    if (!user || user.accountStatus !== "active") {
      req.session.destroy(() => {});
      res.status(401).json({ error: "Session is no longer valid." });
      return;
    }

    res.json({ user: publicUser(user) });
  } catch (error) {
    console.error("Session check failed:", error);
    res.status(500).json({ error: "Unable to check session." });
  }
});

authRouter.post("/auth/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      res.status(500).json({ error: "Unable to log out." });
      return;
    }

    res.clearCookie("connect.sid", {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
    });

    res.json({ message: "Logged out successfully." });
  });
});
authRouter.get("/auth/home-role", async (req, res) => {
  try {
    if (!req.session.userId) {
      res.status(401).json({ error: "Not logged in." });
      return;
    }

    const [ownedHome] = await db
      .select({ id: homes.id })
      .from(homes)
      .where(eq(homes.ownerUserId, req.session.userId))
      .limit(1);

    res.json({
      role: ownedHome ? "owner" : "member",
      canManageDevices: Boolean(ownedHome),
    });
  } catch (error) {
    console.error("Failed to check home role:", error);
    res.status(500).json({ error: "Unable to check home role." });
  }
});
export default authRouter;
