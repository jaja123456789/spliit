-- CreateTable
CREATE TABLE "ExpenseItem" (
"id" TEXT NOT NULL,
"name" TEXT NOT NULL,
"price" INTEGER NOT NULL,
"expenseId" TEXT NOT NULL,
"participantIds" TEXT[],

CONSTRAINT "ExpenseItem_pkey" PRIMARY KEY ("id")

);
-- AddForeignKey
ALTER TABLE "ExpenseItem" ADD CONSTRAINT "ExpenseItem_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
