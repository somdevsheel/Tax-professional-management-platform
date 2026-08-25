-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_action_created_at_idx" ON "audit_logs"("actor_user_id", "action", "created_at");
