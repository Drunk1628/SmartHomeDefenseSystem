CREATE TABLE audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    actor_user_id BIGINT,

    action VARCHAR(100) NOT NULL,

    resource_type VARCHAR(50) NOT NULL,

    resource_id VARCHAR(100),

    outcome VARCHAR(20) NOT NULL
        CONSTRAINT audit_logs_outcome_check
        CHECK (outcome IN ('success', 'denied', 'failure')),

    source_ip INET,

    details JSONB,

    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_audit_logs_actor
        FOREIGN KEY (actor_user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
);

CREATE INDEX idx_audit_logs_actor_time
    ON audit_logs (actor_user_id, occurred_at DESC);

CREATE INDEX idx_audit_logs_action_time
    ON audit_logs (action, occurred_at DESC);

CREATE INDEX idx_audit_logs_resource
    ON audit_logs (resource_type, resource_id);

CREATE INDEX idx_audit_logs_outcome_time
    ON audit_logs (outcome, occurred_at DESC);
