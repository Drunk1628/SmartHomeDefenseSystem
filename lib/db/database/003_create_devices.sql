
CREATE TABLE devices (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    home_id BIGINT NOT NULL,

    device_name VARCHAR(100) NOT NULL,

    device_type VARCHAR(50) NOT NULL,

    device_identifier VARCHAR(255) NOT NULL,

    ip_address VARCHAR(45),

    room VARCHAR(100),

    firmware_version VARCHAR(100),

    trust_status VARCHAR(20) NOT NULL DEFAULT 'untrusted'
        CONSTRAINT devices_trust_status_check
        CHECK (trust_status IN ('trusted', 'untrusted', 'quarantined')),

    connection_status VARCHAR(20) NOT NULL DEFAULT 'unknown'
        CONSTRAINT devices_connection_status_check
        CHECK (connection_status IN ('online', 'offline', 'unknown')),

    last_seen_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_devices_home
        FOREIGN KEY (home_id)
        REFERENCES homes(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_devices_identifier UNIQUE (device_identifier)
);

-- Supports retrieving devices belonging to a home.
CREATE INDEX idx_devices_home_id
    ON devices (home_id);

-- Supports filtering devices by trust status.
CREATE INDEX idx_devices_trust_status
    ON devices (trust_status);

-- Supports finding devices by connection status.
CREATE INDEX idx_devices_connection_status
    ON devices (connection_status);
