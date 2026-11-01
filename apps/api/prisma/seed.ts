import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL must be configured before seeding");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

function easterSunday(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function southAfricanHolidays(year: number) {
  const easter = easterSunday(year);
  const add = (date: Date, days: number) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
  const fixed: Array<[string, number, number]> = [
    ["New Year's Day",1,1],["Human Rights Day",3,21],["Freedom Day",4,27],
    ["Workers' Day",5,1],["Youth Day",6,16],["National Women's Day",8,9],
    ["Heritage Day",9,24],["Day of Reconciliation",12,16],
    ["Christmas Day",12,25],["Day of Goodwill",12,26]
  ];
  const entries = fixed.map(([name, month, day]) => ({ name, date: new Date(Date.UTC(year, month - 1, day as number)) }));
  entries.push({ name: "Good Friday", date: add(easter, -2) }, { name: "Family Day", date: add(easter, 1) });
  const occupied = new Set(entries.map(x => x.date.toISOString().slice(0,10)));
  const observed = entries.map(item => {
    if (item.date.getUTCDay() !== 0) return item;
    let next = add(item.date, 1);
    while (occupied.has(next.toISOString().slice(0,10))) next = add(next, 1);
    occupied.add(next.toISOString().slice(0,10));
    return { name: item.name + " (observed)", date: next };
  });
  return [...entries, ...observed.filter(x => x.name.endsWith("(observed)"))];
}

async function main() {
  const departments = ["Operations","Cash Services","Client Liaison","IT & Systems","Human Resources","Finance","Compliance & Risk"];
  for (const name of departments) await prisma.department.upsert({ where: { name }, update: {}, create: { name } });

  const sites = [
    { code:"TCM-01", name:"TCM", address:"45 Rivonia Road", city:"Sandton, Johannesburg", province:"Gauteng" },
    { code:"MRV-01", name:"Maravi", address:"14 Marshall Street", city:"Johannesburg", province:"Gauteng" },
    { code:"PTC-01", name:"Portuguese Consulate", address:"851 Church Street, Arcadia", city:"Pretoria", province:"Gauteng" },
    { code:"SUN-01", name:"Sun City Main Site", address:"1 Sun City Drive, Sun City", city:"Rustenburg", province:"North West" },
    { code:"SUN-02", name:"Sandton Office", address:"30 Baker Street, 5th Floor, Rosebank", city:"Johannesburg", province:"Gauteng" },
    { code:"ENT-01", name:"Entellect", address:"23 Cato Road, Waverley", city:"Johannesburg", province:"Gauteng" }
  ];
  for (const site of sites) await prisma.postingSite.upsert({ where: { code: site.code }, update: {}, create: site });

  await prisma.workingSchedule.upsert({
    where: { name: "Standard Monday-Friday" }, update: {},
    create: { name: "Standard Monday-Friday", workingDays: [1,2,3,4,5], description: "Initial default schedule; confirm employee rosters with CIT before production." }
  });

  for (let year = 2025; year <= 2035; year++) {
    for (const holiday of southAfricanHolidays(year)) {
      await prisma.publicHoliday.upsert({
        where: { date: holiday.date }, update: { name: holiday.name },
        create: { date: holiday.date, name: holiday.name, countryCode: "ZA" }
      });
    }
  }
  console.log("Seeded reference departments, posting sites, standard schedule and South African public holidays.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
