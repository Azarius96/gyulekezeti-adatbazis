-- DropForeignKey
ALTER TABLE "Baptism" DROP CONSTRAINT "Baptism_personId_fkey";

-- DropForeignKey
ALTER TABLE "Burial" DROP CONSTRAINT "Burial_personId_fkey";

-- DropForeignKey
ALTER TABLE "Burial" DROP CONSTRAINT "Burial_sirhelyId_fkey";

-- DropForeignKey
ALTER TABLE "Cemetery" DROP CONSTRAINT "Cemetery_gyulekezetId_fkey";

-- DropForeignKey
ALTER TABLE "ChurchDuesConfig" DROP CONSTRAINT "ChurchDuesConfig_gyulekezetId_fkey";

-- DropForeignKey
ALTER TABLE "Confirmation" DROP CONSTRAINT "Confirmation_personId_fkey";

-- DropForeignKey
ALTER TABLE "Donation" DROP CONSTRAINT "Donation_personId_fkey";

-- DropForeignKey
ALTER TABLE "DuesDiscount" DROP CONSTRAINT "DuesDiscount_configId_fkey";

-- DropForeignKey
ALTER TABLE "DuesPayment" DROP CONSTRAINT "DuesPayment_personId_fkey";

-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_gyulekezetId_fkey";

-- DropForeignKey
ALTER TABLE "FamilyLink" DROP CONSTRAINT "FamilyLink_childId_fkey";

-- DropForeignKey
ALTER TABLE "FamilyLink" DROP CONSTRAINT "FamilyLink_parentId_fkey";

-- DropForeignKey
ALTER TABLE "GravePriceConfig" DROP CONSTRAINT "GravePriceConfig_gyulekezetId_fkey";

-- DropForeignKey
ALTER TABLE "GravePurchase" DROP CONSTRAINT "GravePurchase_sirhelyId_fkey";

-- DropForeignKey
ALTER TABLE "Household" DROP CONSTRAINT "Household_gyulekezetId_fkey";

-- DropForeignKey
ALTER TABLE "HouseholdMember" DROP CONSTRAINT "HouseholdMember_householdId_fkey";

-- DropForeignKey
ALTER TABLE "HouseholdMember" DROP CONSTRAINT "HouseholdMember_personId_fkey";

-- DropForeignKey
ALTER TABLE "Marriage" DROP CONSTRAINT "Marriage_spouseAId_fkey";

-- DropForeignKey
ALTER TABLE "Marriage" DROP CONSTRAINT "Marriage_spouseBId_fkey";

-- DropForeignKey
ALTER TABLE "MovingRequest" DROP CONSTRAINT "MovingRequest_personId_fkey";

-- DropForeignKey
ALTER TABLE "Parcella" DROP CONSTRAINT "Parcella_cemeteryId_fkey";

-- DropForeignKey
ALTER TABLE "Person" DROP CONSTRAINT "Person_gyulekezetId_fkey";

-- DropForeignKey
ALTER TABLE "Position" DROP CONSTRAINT "Position_gyulekezetId_fkey";

-- DropForeignKey
ALTER TABLE "Position" DROP CONSTRAINT "Position_personId_fkey";

-- DropForeignKey
ALTER TABLE "Sirhely" DROP CONSTRAINT "Sirhely_parcellaId_fkey";

-- DropForeignKey
ALTER TABLE "UserRole" DROP CONSTRAINT "UserRole_gyulekezetId_fkey";

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_gyulekezetId_fkey" FOREIGN KEY ("gyulekezetId") REFERENCES "Gyulekezet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Household" ADD CONSTRAINT "Household_gyulekezetId_fkey" FOREIGN KEY ("gyulekezetId") REFERENCES "Gyulekezet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_gyulekezetId_fkey" FOREIGN KEY ("gyulekezetId") REFERENCES "Gyulekezet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyLink" ADD CONSTRAINT "FamilyLink_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyLink" ADD CONSTRAINT "FamilyLink_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Marriage" ADD CONSTRAINT "Marriage_spouseAId_fkey" FOREIGN KEY ("spouseAId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Marriage" ADD CONSTRAINT "Marriage_spouseBId_fkey" FOREIGN KEY ("spouseBId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Baptism" ADD CONSTRAINT "Baptism_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Confirmation" ADD CONSTRAINT "Confirmation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurchDuesConfig" ADD CONSTRAINT "ChurchDuesConfig_gyulekezetId_fkey" FOREIGN KEY ("gyulekezetId") REFERENCES "Gyulekezet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuesDiscount" ADD CONSTRAINT "DuesDiscount_configId_fkey" FOREIGN KEY ("configId") REFERENCES "ChurchDuesConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuesPayment" ADD CONSTRAINT "DuesPayment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_gyulekezetId_fkey" FOREIGN KEY ("gyulekezetId") REFERENCES "Gyulekezet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cemetery" ADD CONSTRAINT "Cemetery_gyulekezetId_fkey" FOREIGN KEY ("gyulekezetId") REFERENCES "Gyulekezet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parcella" ADD CONSTRAINT "Parcella_cemeteryId_fkey" FOREIGN KEY ("cemeteryId") REFERENCES "Cemetery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sirhely" ADD CONSTRAINT "Sirhely_parcellaId_fkey" FOREIGN KEY ("parcellaId") REFERENCES "Parcella"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Burial" ADD CONSTRAINT "Burial_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Burial" ADD CONSTRAINT "Burial_sirhelyId_fkey" FOREIGN KEY ("sirhelyId") REFERENCES "Sirhely"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GravePriceConfig" ADD CONSTRAINT "GravePriceConfig_gyulekezetId_fkey" FOREIGN KEY ("gyulekezetId") REFERENCES "Gyulekezet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GravePurchase" ADD CONSTRAINT "GravePurchase_sirhelyId_fkey" FOREIGN KEY ("sirhelyId") REFERENCES "Sirhely"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovingRequest" ADD CONSTRAINT "MovingRequest_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_gyulekezetId_fkey" FOREIGN KEY ("gyulekezetId") REFERENCES "Gyulekezet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
