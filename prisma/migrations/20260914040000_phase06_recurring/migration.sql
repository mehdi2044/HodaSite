-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "recurringSourceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Expense_recurringSourceId_key" ON "Expense"("recurringSourceId");

ALTER TABLE "Expense" ADD FOREIGN KEY ("recurringSourceId") REFERENCES "Expense"(id) ON DELETE RESTRICT;
