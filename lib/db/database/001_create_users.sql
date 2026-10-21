CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    email VARCHAR(255) NOT NULL,

    password_hash TEXT NOT NULL,

    display_name VARCHAR(100) NOT NULL,

    account_status VARCHAR(20) NOT NULL DEFAULT 'active'
        CONSTRAINT users_account_status_check
        CHECK (
            account_status IN ('active', 'locked', 'disabled')
        ),

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users
ADD CONSTRAINT uq_users_email UNIQUE (email);

-- Supports searching accounts by status.
CREATE INDEX idx_users_account_status
    ON users (account_status);
