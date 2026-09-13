/*
  Warnings:

  - Made the column `emeletAjto` on table `Address` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Address" ALTER COLUMN "emeletAjto" SET NOT NULL,
ALTER COLUMN "emeletAjto" SET DEFAULT '';
