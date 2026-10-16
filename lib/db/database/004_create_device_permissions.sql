CREATE TABLE device_permissions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    user_id BIGINT NOT NULL,

    device_id BIGINT NOT NULL,

    permission VARCHAR(30) NOT NULL
        CHECK (
            permission IN ('view', 'control', 'manage')
        ),

    granted_by BIGINT,

    granted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_device_permissions_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_device_permissions_device
        FOREIGN KEY (device_id)
        REFERENCES devices(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_device_permissions_granted_by
        FOREIGN KEY (granted_by)
        REFERENCES users(id)
        ON DELETE SET NULL,

    CONSTRAINT uq_device_permission
        UNIQUE (user_id, device_id, permission)
);

-- Find the permissions belonging to a user.
CREATE INDEX idx_device_permissions_user_id
    ON device_permissions (user_id);

-- Find users who have access to a particular device.
CREATE INDEX idx_device_permissions_device_id
    ON device_permissions (device_id);
