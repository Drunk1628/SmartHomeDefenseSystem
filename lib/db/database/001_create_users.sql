
-- 001_create_users.sql
-- Stores user accounts for the IoT Home Protection System.

CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    email VARCHAR(255) NOT NULL UNIQUE,

    password_hash TEXT NOT NULL,

    display_name VARCHAR(100) NOT NULL,

    account_status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (
            account_status IN ('active', 'locked', 'disabled')
        ),

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Supports searching accounts by status.
CREATE INDEX idx_users_account_status
    ON users (account_status);
