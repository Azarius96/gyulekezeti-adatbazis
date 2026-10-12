-- CreateIndex
CREATE INDEX "Person_gyulekezetId_deletedAt_elhunyt_elkoltozott_idx" ON "Person"("gyulekezetId", "deletedAt", "elhunyt", "elkoltozott");
