-- CreateEnum
CREATE TYPE "SzerepKor" AS ENUM ('ADMIN', 'PUSPOK', 'ESPERES', 'LELKESZ', 'DELEGALT');

-- CreateEnum
CREATE TYPE "HaztartasSzerep" AS ENUM ('CSALADFO', 'HAZASTARS', 'GYERMEK', 'EGYEB');

-- CreateEnum
CREATE TYPE "Nem" AS ENUM ('FERFI', 'NO');

-- CreateEnum
CREATE TYPE "MovingStatus" AS ENUM ('FUGGOBEN', 'ELFOGADVA', 'ELUTASITVA', 'ISMERETLEN_CELBA');

-- CreateEnum
CREATE TYPE "EsemenySzint" AS ENUM ('HELYI', 'MEGYEI', 'KERULETI');

-- CreateEnum
CREATE TYPE "EsemenyStatus" AS ENUM ('AKTIV', 'ESKALACIO_FUGGOBEN', 'JOVAHAGYVA', 'ELUTASITVA');

-- CreateTable
CREATE TABLE "Kerulet" (
    "id" TEXT NOT NULL,
    "nev" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Kerulet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Egyhazmegye" (
    "id" TEXT NOT NULL,
    "nev" TEXT NOT NULL,
    "keruletId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Egyhazmegye_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gyulekezet" (
    "id" TEXT NOT NULL,
    "nev" TEXT NOT NULL,
    "egyhazmegyeId" TEXT NOT NULL,
    "publicSlug" TEXT,
    "publicDescription" TEXT,
    "publicAddress" TEXT,
    "publicContact" TEXT,
    "publicServiceInfo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gyulekezet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nev" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "szerepKor" "SzerepKor" NOT NULL,
    "keruletId" TEXT,
    "egyhazmegyeId" TEXT,
    "gyulekezetId" TEXT,
    "personId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCapability" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kod" TEXT NOT NULL,

    CONSTRAINT "UserCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "iranyitoszam" TEXT,
    "telepules" TEXT NOT NULL,
    "utca" TEXT NOT NULL,
    "hazszam" TEXT NOT NULL,
    "emeletAjto" TEXT,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Household" (
    "id" TEXT NOT NULL,
    "nev" TEXT,
    "addressId" TEXT NOT NULL,
    "gyulekezetId" TEXT NOT NULL,
    "vallasTipusManualis" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdMember" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "szerep" "HaztartasSzerep" NOT NULL,
    "kezdete" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vege" TIMESTAMP(3),

    CONSTRAINT "HouseholdMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "vezeteknev" TEXT NOT NULL,
    "keresztnev" TEXT NOT NULL,
    "nem" "Nem" NOT NULL,
    "szuletesiDatum" TIMESTAMP(3),
    "szuletesiHely" TEXT,
    "vallas" TEXT,
    "elhunyt" BOOLEAN NOT NULL DEFAULT false,
    "elhunytDatuma" TIMESTAMP(3),
    "gyulekezetId" TEXT NOT NULL,
    "publicVisible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyLink" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,

    CONSTRAINT "FamilyLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Marriage" (
    "id" TEXT NOT NULL,
    "spouseAId" TEXT NOT NULL,
    "spouseBId" TEXT NOT NULL,
    "datuma" TIMESTAMP(3),
    "helye" TEXT,
    "lelkeszNeve" TEXT,
    "vege" TIMESTAMP(3),

    CONSTRAINT "Marriage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Baptism" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "datuma" TIMESTAMP(3) NOT NULL,
    "helye" TEXT,
    "lelkeszNeve" TEXT,
    "keresztszulok" TEXT,

    CONSTRAINT "Baptism_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Confirmation" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "datuma" TIMESTAMP(3) NOT NULL,
    "helye" TEXT,
    "lelkeszNeve" TEXT,

    CONSTRAINT "Confirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfirmationClass" (
    "id" TEXT NOT NULL,
    "gyulekezetId" TEXT NOT NULL,
    "megnevezes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfirmationClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfirmationClassMember" (
    "id" TEXT NOT NULL,
    "confirmationClassId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,

    CONSTRAINT "ConfirmationClassMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChurchDuesConfig" (
    "id" TEXT NOT NULL,
    "gyulekezetId" TEXT NOT NULL,
    "ervenyesTol" TIMESTAMP(3) NOT NULL,
    "ervenyesIg" TIMESTAMP(3),
    "korhatarTol" INTEGER NOT NULL,
    "korhatarIg" INTEGER NOT NULL,
    "osszeg" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "ChurchDuesConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuesDiscount" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "megnevezes" TEXT NOT NULL,
    "szazalek" INTEGER NOT NULL,

    CONSTRAINT "DuesDiscount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuesPayment" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "ev" INTEGER NOT NULL,
    "osszeg" DECIMAL(65,30) NOT NULL,
    "tipus" TEXT NOT NULL,
    "fizetesDatuma" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gyulekezetIdEkkor" TEXT NOT NULL,

    CONSTRAINT "DuesPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "gyulekezetId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "tisztseg" TEXT NOT NULL,
    "kezdete" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vege" TIMESTAMP(3),
    "publikus" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cemetery" (
    "id" TEXT NOT NULL,
    "gyulekezetId" TEXT NOT NULL,
    "nev" TEXT NOT NULL,

    CONSTRAINT "Cemetery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parcella" (
    "id" TEXT NOT NULL,
    "cemeteryId" TEXT NOT NULL,
    "jelzes" TEXT NOT NULL,

    CONSTRAINT "Parcella_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sirhely" (
    "id" TEXT NOT NULL,
    "parcellaId" TEXT NOT NULL,
    "jelzes" TEXT NOT NULL,

    CONSTRAINT "Sirhely_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Burial" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "sirhelyId" TEXT NOT NULL,
    "datuma" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Burial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GravePriceConfig" (
    "id" TEXT NOT NULL,
    "gyulekezetId" TEXT NOT NULL,
    "ervenyessegEv" INTEGER NOT NULL,
    "osszeg" DECIMAL(65,30) NOT NULL,
    "ervenyesTol" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GravePriceConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GravePurchase" (
    "id" TEXT NOT NULL,
    "sirhelyId" TEXT NOT NULL,
    "megvaltoNeve" TEXT NOT NULL,
    "megvaltoPersonId" TEXT,
    "datuma" TIMESTAMP(3) NOT NULL,
    "osszeg" DECIMAL(65,30) NOT NULL,
    "lejarat" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GravePurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovingRequest" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "regiCim" TEXT NOT NULL,
    "ujCim" TEXT NOT NULL,
    "indoklas" TEXT,
    "celGyulekezetId" TEXT,
    "status" "MovingStatus" NOT NULL DEFAULT 'FUGGOBEN',
    "kezdemenyezve" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "elbiralva" TIMESTAMP(3),

    CONSTRAINT "MovingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "cim" TEXT NOT NULL,
    "leiras" TEXT,
    "datuma" TIMESTAMP(3) NOT NULL,
    "szint" "EsemenySzint" NOT NULL DEFAULT 'HELYI',
    "status" "EsemenyStatus" NOT NULL DEFAULT 'AKTIV',
    "gyulekezetId" TEXT,
    "egyhazmegyeId" TEXT,
    "keruletId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Gyulekezet_publicSlug_key" ON "Gyulekezet"("publicSlug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_personId_key" ON "User"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "UserCapability_userId_kod_key" ON "UserCapability"("userId", "kod");

-- CreateIndex
CREATE UNIQUE INDEX "Address_telepules_utca_hazszam_emeletAjto_key" ON "Address"("telepules", "utca", "hazszam", "emeletAjto");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdMember_householdId_personId_kezdete_key" ON "HouseholdMember"("householdId", "personId", "kezdete");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyLink_parentId_childId_key" ON "FamilyLink"("parentId", "childId");

-- CreateIndex
CREATE UNIQUE INDEX "Marriage_spouseAId_spouseBId_datuma_key" ON "Marriage"("spouseAId", "spouseBId", "datuma");

-- CreateIndex
CREATE UNIQUE INDEX "Baptism_personId_key" ON "Baptism"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "Confirmation_personId_key" ON "Confirmation"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "Burial_personId_key" ON "Burial"("personId");

-- AddForeignKey
ALTER TABLE "Egyhazmegye" ADD CONSTRAINT "Egyhazmegye_keruletId_fkey" FOREIGN KEY ("keruletId") REFERENCES "Kerulet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gyulekezet" ADD CONSTRAINT "Gyulekezet_egyhazmegyeId_fkey" FOREIGN KEY ("egyhazmegyeId") REFERENCES "Egyhazmegye"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_keruletId_fkey" FOREIGN KEY ("keruletId") REFERENCES "Kerulet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_egyhazmegyeId_fkey" FOREIGN KEY ("egyhazmegyeId") REFERENCES "Egyhazmegye"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_gyulekezetId_fkey" FOREIGN KEY ("gyulekezetId") REFERENCES "Gyulekezet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCapability" ADD CONSTRAINT "UserCapability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Household" ADD CONSTRAINT "Household_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Household" ADD CONSTRAINT "Household_gyulekezetId_fkey" FOREIGN KEY ("gyulekezetId") REFERENCES "Gyulekezet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_gyulekezetId_fkey" FOREIGN KEY ("gyulekezetId") REFERENCES "Gyulekezet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyLink" ADD CONSTRAINT "FamilyLink_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyLink" ADD CONSTRAINT "FamilyLink_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Marriage" ADD CONSTRAINT "Marriage_spouseAId_fkey" FOREIGN KEY ("spouseAId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Marriage" ADD CONSTRAINT "Marriage_spouseBId_fkey" FOREIGN KEY ("spouseBId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Baptism" ADD CONSTRAINT "Baptism_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Confirmation" ADD CONSTRAINT "Confirmation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfirmationClassMember" ADD CONSTRAINT "ConfirmationClassMember_confirmationClassId_fkey" FOREIGN KEY ("confirmationClassId") REFERENCES "ConfirmationClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurchDuesConfig" ADD CONSTRAINT "ChurchDuesConfig_gyulekezetId_fkey" FOREIGN KEY ("gyulekezetId") REFERENCES "Gyulekezet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuesDiscount" ADD CONSTRAINT "DuesDiscount_configId_fkey" FOREIGN KEY ("configId") REFERENCES "ChurchDuesConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuesPayment" ADD CONSTRAINT "DuesPayment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_gyulekezetId_fkey" FOREIGN KEY ("gyulekezetId") REFERENCES "Gyulekezet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cemetery" ADD CONSTRAINT "Cemetery_gyulekezetId_fkey" FOREIGN KEY ("gyulekezetId") REFERENCES "Gyulekezet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parcella" ADD CONSTRAINT "Parcella_cemeteryId_fkey" FOREIGN KEY ("cemeteryId") REFERENCES "Cemetery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sirhely" ADD CONSTRAINT "Sirhely_parcellaId_fkey" FOREIGN KEY ("parcellaId") REFERENCES "Parcella"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Burial" ADD CONSTRAINT "Burial_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Burial" ADD CONSTRAINT "Burial_sirhelyId_fkey" FOREIGN KEY ("sirhelyId") REFERENCES "Sirhely"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GravePriceConfig" ADD CONSTRAINT "GravePriceConfig_gyulekezetId_fkey" FOREIGN KEY ("gyulekezetId") REFERENCES "Gyulekezet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GravePurchase" ADD CONSTRAINT "GravePurchase_sirhelyId_fkey" FOREIGN KEY ("sirhelyId") REFERENCES "Sirhely"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GravePurchase" ADD CONSTRAINT "GravePurchase_megvaltoPersonId_fkey" FOREIGN KEY ("megvaltoPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovingRequest" ADD CONSTRAINT "MovingRequest_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovingRequest" ADD CONSTRAINT "MovingRequest_celGyulekezetId_fkey" FOREIGN KEY ("celGyulekezetId") REFERENCES "Gyulekezet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_gyulekezetId_fkey" FOREIGN KEY ("gyulekezetId") REFERENCES "Gyulekezet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_egyhazmegyeId_fkey" FOREIGN KEY ("egyhazmegyeId") REFERENCES "Egyhazmegye"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_keruletId_fkey" FOREIGN KEY ("keruletId") REFERENCES "Kerulet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
