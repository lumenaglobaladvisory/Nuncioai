-- AlterTable
ALTER TABLE "Policy" ADD COLUMN     "templateKey" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardedAt" TIMESTAMP(3);
