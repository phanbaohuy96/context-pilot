-- AlterTable
ALTER TABLE "AiProviderSettings" ADD COLUMN     "diarizationEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "meetingNotesEnabled" BOOLEAN NOT NULL DEFAULT false;
