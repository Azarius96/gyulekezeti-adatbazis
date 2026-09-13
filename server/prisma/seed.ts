import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const kerulet = await prisma.kerulet.create({ data: { nev: "Erdélyi Kerület" } });
  const egyhazmegye = await prisma.egyhazmegye.create({
    data: { nev: "Küküllői Egyházmegye", keruletId: kerulet.id },
  });
  const gyulekezet = await prisma.gyulekezet.create({
    data: {
      nev: "Mintafalvi Gyülekezet",
      egyhazmegyeId: egyhazmegye.id,
      publicSlug: "mintafalva",
    },
  });

  const passwordHash = await bcrypt.hash("admin1234", 10);
  await prisma.user.create({
    data: {
      email: "admin@example.com",
      nev: "Rendszergazda",
      passwordHash,
      roles: { create: [{ szerepKor: "ADMIN" }] },
    },
  });

  const lelkeszHash = await bcrypt.hash("lelkesz1234", 10);
  await prisma.user.create({
    data: {
      email: "lelkesz@example.com",
      nev: "Kovács Endre lelkész",
      passwordHash: lelkeszHash,
      roles: { create: [{ szerepKor: "LELKESZ", gyulekezetId: gyulekezet.id }] },
    },
  });

  const nagyapa = await prisma.person.create({
    data: { vezeteknev: "Kovács", keresztnev: "István", nem: "FERFI", gyulekezetId: gyulekezet.id, vallas: "református" },
  });
  const nagyanya = await prisma.person.create({
    data: { vezeteknev: "Kovács", keresztnev: "Erzsébet", nem: "NO", gyulekezetId: gyulekezet.id, vallas: "református" },
  });
  const apa = await prisma.person.create({
    data: { vezeteknev: "Kovács", keresztnev: "János", nem: "FERFI", gyulekezetId: gyulekezet.id, vallas: "református" },
  });
  const anya = await prisma.person.create({
    data: { vezeteknev: "Nagy", keresztnev: "Mária", nem: "NO", gyulekezetId: gyulekezet.id, vallas: "református" },
  });
  const gyerek = await prisma.person.create({
    data: {
      vezeteknev: "Kovács",
      keresztnev: "Anna",
      nem: "NO",
      gyulekezetId: gyulekezet.id,
      vallas: "református",
      szuletesiDatum: new Date(now().getFullYear() - 13, 4, 12),
    },
  });

  await prisma.familyLink.createMany({
    data: [
      { parentId: nagyapa.id, childId: apa.id },
      { parentId: nagyanya.id, childId: apa.id },
      { parentId: apa.id, childId: gyerek.id },
      { parentId: anya.id, childId: gyerek.id },
    ],
  });

  await prisma.marriage.create({
    data: { spouseAId: apa.id, spouseBId: anya.id, datuma: new Date("2008-06-14"), helye: "Mintafalva" },
  });
  await prisma.marriage.create({
    data: { spouseAId: nagyapa.id, spouseBId: nagyanya.id, datuma: new Date("1978-09-02"), helye: "Mintafalva" },
  });

  const address = await prisma.address.create({
    data: { telepules: "Mintafalva", utca: "Fő utca", hazszam: "12" },
  });
  const household = await prisma.household.create({
    data: { nev: "Kovács család", addressId: address.id, gyulekezetId: gyulekezet.id },
  });
  await prisma.householdMember.createMany({
    data: [
      { householdId: household.id, personId: apa.id, szerep: "CSALADFO" },
      { householdId: household.id, personId: anya.id, szerep: "HAZASTARS" },
      { householdId: household.id, personId: gyerek.id, szerep: "GYERMEK" },
    ],
  });

  await prisma.position.createMany({
    data: [
      { gyulekezetId: gyulekezet.id, personId: nagyapa.id, tisztseg: "GONDNOK" },
      { gyulekezetId: gyulekezet.id, personId: apa.id, tisztseg: "PRESBITER" },
    ],
  });

  console.log("Seed kész. Admin: admin@example.com / admin1234, Lelkész: lelkesz@example.com / lelkesz1234");
}

function now() {
  return new Date();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
