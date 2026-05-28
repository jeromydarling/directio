/**
 * Demo organization seeder.
 *
 * Spins up a fully-populated school inside D1: 1 owner, 3 instructors,
 * 4 vehicles, 24 students, mixed-state enrollments, 30 days of past
 * scheduling, 14 days of future scheduling, varied payment statuses,
 * a handful of guardians, and a populated audit log. The result feels
 * like a real school you've been operating for a month.
 *
 * Demo orgs carry isDemo=1 and a demoExpiresAt timestamp 24h ahead.
 * The hourly cron sweeps anything past expiry; ON DELETE CASCADE
 * cleans up dependent rows.
 *
 * Performance: ~70 D1 statements per seed, batched in one
 * env.DB.batch() call. Should land in well under a second.
 */

import { newId, slugify } from "./ids";

const FIRST_NAMES = [
  "Alex", "Aaliyah", "Beck", "Bea", "Casey", "Carmen", "Dani", "Diego",
  "Emery", "Esme", "Finley", "Faith", "Gabriel", "Greta", "Harper",
  "Hassan", "Indigo", "Imani", "Jordan", "Joaquin", "Kai", "Keira",
  "Logan", "Luna", "Marlow", "Marisol", "Nico", "Nadia", "Oakley",
  "Olamide", "Parker", "Priya", "Quinn", "Quintessa", "River",
  "Reyna", "Sage", "Soren", "Tatum", "Tariq", "Umi", "Uma", "Vesper",
  "Vihaan", "Wren", "Willa", "Xander", "Yara", "Zion", "Zara",
];
const LAST_NAMES = [
  "Aguilar", "Brennan", "Choi", "Davis", "Espinoza", "Foster", "Greer",
  "Hatcher", "Iyer", "Jankowski", "Khan", "Larsen", "Mendoza", "Nakamura",
  "O'Donnell", "Pham", "Quesada", "Reyes", "Singh", "Thatcher",
  "Underwood", "Vasquez", "Whitlock", "Xiong", "Yoshida", "Ziegler",
];
const SCHOOL_NAMES = [
  "Sunrise", "Northbound", "Lakeshore", "Cardinal", "Riverside",
  "Compass", "Highway 12", "Trailhead", "Cedar Park", "Pioneer",
];
const CAR_MODELS = [
  ["Honda", "Civic"], ["Toyota", "Corolla"], ["Hyundai", "Elantra"],
  ["Kia", "Forte"], ["Nissan", "Sentra"], ["Mazda", "3"],
  ["Subaru", "Impreza"], ["Chevrolet", "Malibu"],
];
const PROGRAM_FOCI = [
  "Highway merging and lane changes",
  "Parallel parking — bring the cones",
  "Adverse-weather basics",
  "Defensive driving + scanning",
  "Road test rehearsal — actual exam route",
  "Backing & 3-point turns",
  "Suburban arterial speeds",
  "Night driving introduction",
];

const STATE_CITIES: Record<string, { city: string; postal: string; zone: string }> = {
  MN: { city: "St. Paul", postal: "55101", zone: "America/Chicago" },
  TX: { city: "Austin", postal: "78701", zone: "America/Chicago" },
  CA: { city: "San Diego", postal: "92101", zone: "America/Los_Angeles" },
  FL: { city: "Orlando", postal: "32801", zone: "America/New_York" },
  NY: { city: "Albany", postal: "12207", zone: "America/New_York" },
  OH: { city: "Columbus", postal: "43215", zone: "America/New_York" },
  IL: { city: "Chicago", postal: "60601", zone: "America/Chicago" },
  WA: { city: "Seattle", postal: "98101", zone: "America/Los_Angeles" },
  AZ: { city: "Phoenix", postal: "85003", zone: "America/Phoenix" },
  CO: { city: "Denver", postal: "80202", zone: "America/Denver" },
  NC: { city: "Raleigh", postal: "27601", zone: "America/New_York" },
  GA: { city: "Atlanta", postal: "30303", zone: "America/New_York" },
};

type Lead = {
  name: string;
  email: string;
  role: "owner" | "admin" | "instructor" | "curious";
  stateCode: string; // 2-letter
};

type SeedResult = {
  organizationId: string;
  userId: string;
  slug: string;
  expiresAt: number;
};

/**
 * Cheap deterministic PRNG seeded by the (new) org id so each demo
 * looks varied but is reproducible if we ever need to debug a
 * specific run.
 */
function makeRng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function randPhone(rng: () => number): string {
  const a = 200 + Math.floor(rng() * 800);
  const b = 100 + Math.floor(rng() * 900);
  const c = 1000 + Math.floor(rng() * 9000);
  return `${a}-${b}-${c}`;
}

function pad(n: number, w = 2): string {
  return n.toString().padStart(w, "0");
}

/**
 * Seed a demo org alongside a freshly-created Better Auth user.
 * The caller is responsible for creating the user + session via
 * `auth.api.signUpEmail`; we just write the demo organization and
 * link the user via `member`.
 */
export async function seedDemoOrg(
  env: Env,
  lead: Lead,
  userId: string,
): Promise<SeedResult> {
  const orgId = newId();
  const rng = makeRng(orgId);
  const now = Date.now();
  const expiresAt = now + 24 * 60 * 60 * 1000;

  const stateInfo = STATE_CITIES[lead.stateCode] ?? STATE_CITIES.MN!;
  const schoolBase = pick(rng, SCHOOL_NAMES);
  const orgName = `${schoolBase} Driving Academy`;
  const slug = `demo-${slugify(schoolBase)}-${orgId.slice(0, 6)}`;

  const stmts: D1PreparedStatement[] = [];

  // --- Organization & membership -------------------------------------
  stmts.push(
    env.DB.prepare(
      `INSERT INTO organization
         (id, slug, name, jurisdiction, brandColor, publicSlug, publicPublishedAt,
          payCadence, geolocationPolicy, createdAt, isDemo, demoExpiresAt,
          cancellationDeadlineHours, lateCancelFeeCents, noShowFeeCents,
          allowFamilyReschedule, stripeAccountStatus, stripeChargesEnabled,
          stripePayoutsEnabled, stripeDetailsSubmitted)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'biweekly', 'opt_in', ?, 1, ?,
               24, 2500, 5000, 1, 'active', 1, 1, 1)`,
    ).bind(
      orgId,
      slug,
      orgName,
      `US-${lead.stateCode}`,
      "#7c3aed",
      slug,
      now,
      now,
      expiresAt,
    ),
  );

  stmts.push(
    env.DB.prepare(
      `INSERT INTO member (id, organizationId, userId, role, createdAt)
       VALUES (?, ?, ?, 'owner', ?)`,
    ).bind(newId(), orgId, userId, now),
  );

  // --- Location ------------------------------------------------------
  const locationId = newId();
  stmts.push(
    env.DB.prepare(
      `INSERT INTO location
         (id, organizationId, name, addressLine1, city, region, postalCode,
          active, createdAt)
       VALUES (?, ?, 'Main office', ?, ?, ?, ?, 1, ?)`,
    ).bind(
      locationId,
      orgId,
      `${100 + Math.floor(rng() * 4000)} ${pick(rng, ["Main", "Oak", "Lake", "Pioneer", "Park"])} St`,
      stateInfo.city,
      lead.stateCode,
      stateInfo.postal,
      now,
    ),
  );

  // --- Instructors (3) -----------------------------------------------
  const instructors: { id: string; userId: string; name: string }[] = [];
  for (let i = 0; i < 3; i++) {
    const fn = FIRST_NAMES[(i * 17) % FIRST_NAMES.length]!;
    const ln = LAST_NAMES[(i * 11 + 3) % LAST_NAMES.length]!;
    const instructorUserId = newId();
    const email = `${fn.toLowerCase()}.${ln.toLowerCase().replace(/[^a-z]/g, "")}@${slug}.demo`;
    const instructorId = newId();

    // Create a user row for the instructor so they could in theory sign in.
    stmts.push(
      env.DB.prepare(
        `INSERT INTO user (id, email, emailVerified, name, createdAt, updatedAt)
         VALUES (?, ?, 1, ?, ?, ?)`,
      ).bind(instructorUserId, email, `${fn} ${ln}`, now, now),
    );
    stmts.push(
      env.DB.prepare(
        `INSERT INTO instructor
           (id, organizationId, userId, firstName, lastName, certifications,
            active, createdAt, homeLocationId)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      ).bind(
        instructorId,
        orgId,
        instructorUserId,
        fn,
        ln,
        JSON.stringify(["ADTSEA", "First Aid"]),
        now - (30 - i * 7) * 86400000,
        locationId,
      ),
    );
    stmts.push(
      env.DB.prepare(
        `INSERT INTO member (id, organizationId, userId, role, createdAt)
         VALUES (?, ?, ?, 'instructor', ?)`,
      ).bind(newId(), orgId, instructorUserId, now),
    );

    instructors.push({ id: instructorId, userId: instructorUserId, name: `${fn} ${ln}` });
  }

  // --- Vehicles (4) --------------------------------------------------
  const vehicles: string[] = [];
  for (let i = 0; i < 4; i++) {
    const id = newId();
    const [make, model] = pick(rng, CAR_MODELS);
    const year = 2020 + Math.floor(rng() * 6);
    stmts.push(
      env.DB.prepare(
        `INSERT INTO vehicle
           (id, organizationId, label, makeModel, year, plate, active,
            createdAt, locationId)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      ).bind(
        id,
        orgId,
        `Car ${i + 1} — ${model}`,
        `${make} ${model}`,
        year,
        `DEMO-${pad(i + 1)}${Math.floor(rng() * 100)}`,
        now - (45 - i * 3) * 86400000,
        locationId,
      ),
    );
    vehicles.push(id);
  }

  // --- Programs & packages ------------------------------------------
  const teenProgramId = newId();
  const adultProgramId = newId();
  stmts.push(
    env.DB.prepare(
      `INSERT INTO program
         (id, organizationId, slug, name, kind, description, active, createdAt, updatedAt)
       VALUES (?, ?, 'teen', 'Teen Driver Education', 'teen',
               'Classroom + 6 BTW for new drivers under 18.', 1, ?, ?)`,
    ).bind(teenProgramId, orgId, now, now),
  );
  stmts.push(
    env.DB.prepare(
      `INSERT INTO program
         (id, organizationId, slug, name, kind, description, active, createdAt, updatedAt)
       VALUES (?, ?, 'adult', 'Adult Refresher', 'adult',
               'For licensed adults coming back to driving.', 1, ?, ?)`,
    ).bind(adultProgramId, orgId, now, now),
  );

  const teenStandardId = newId();
  const teenPlusId = newId();
  const adultId = newId();
  stmts.push(
    env.DB.prepare(
      `INSERT INTO programPackage
         (id, organizationId, programId, name, priceCents, currency,
          btwLessonCount, active, createdAt, updatedAt)
       VALUES (?, ?, ?, 'Standard Teen Package', 69900, 'USD', 6, 1, ?, ?)`,
    ).bind(teenStandardId, orgId, teenProgramId, now, now),
  );
  stmts.push(
    env.DB.prepare(
      `INSERT INTO programPackage
         (id, organizationId, programId, name, priceCents, currency,
          btwLessonCount, active, createdAt, updatedAt)
       VALUES (?, ?, ?, 'Teen Plus 4 Extra Lessons', 89900, 'USD', 10, 1, ?, ?)`,
    ).bind(teenPlusId, orgId, teenProgramId, now, now),
  );
  stmts.push(
    env.DB.prepare(
      `INSERT INTO programPackage
         (id, organizationId, programId, name, priceCents, currency,
          btwLessonCount, active, createdAt, updatedAt)
       VALUES (?, ?, ?, 'Adult Refresher — 3 Lessons', 32500, 'USD', 3, 1, ?, ?)`,
    ).bind(adultId, orgId, adultProgramId, now, now),
  );

  // --- Students + enrollments + payments + guardians ----------------
  const journeyStates = [
    "enrolled",
    "classroom",
    "classroom_complete",
    "permit_eligible",
    "permit_issued",
    "btw",
    "btw_complete",
    "complete",
  ] as const;
  const paymentStatuses = ["succeeded", "succeeded", "succeeded", "pending"] as const;

  type Student = {
    id: string;
    firstName: string;
    lastName: string;
    enrollmentId: string;
    instructorId: string;
    vehicleId: string;
  };
  const students: Student[] = [];

  for (let i = 0; i < 24; i++) {
    const firstName = pick(rng, FIRST_NAMES);
    const lastName = pick(rng, LAST_NAMES);
    const studentId = newId();
    const enrollmentId = newId();
    const enrolledAgoDays = 5 + Math.floor(rng() * 60);
    const enrolledAt = now - enrolledAgoDays * 86400000;
    const isAdult = i >= 20;
    const programId = isAdult ? adultProgramId : teenProgramId;
    const packageId = isAdult ? adultId : (i % 5 === 0 ? teenPlusId : teenStandardId);
    const packagePrice = isAdult ? 32500 : i % 5 === 0 ? 89900 : 69900;
    const journey = journeyStates[Math.min(7, Math.floor((enrolledAgoDays / 60) * 8) + (i % 3))]!;
    const enrollmentStatus =
      journey === "complete" ? "completed" : journey === "enrolled" ? "pending" : "active";

    const studentDobYear = isAdult ? 1985 + Math.floor(rng() * 30) : 2008 + Math.floor(rng() * 3);
    stmts.push(
      env.DB.prepare(
        `INSERT INTO student
           (id, organizationId, firstName, lastName, dateOfBirth, email, phone,
            createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        studentId,
        orgId,
        firstName,
        lastName,
        `${studentDobYear}-${pad(1 + Math.floor(rng() * 12))}-${pad(1 + Math.floor(rng() * 27))}`,
        `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/[^a-z]/g, "")}@${slug}.demo`,
        randPhone(rng),
        enrolledAt,
        enrolledAt,
      ),
    );

    stmts.push(
      env.DB.prepare(
        `INSERT INTO enrollment
           (id, organizationId, studentId, programId, programPackageId,
            status, journeyState, enrolledAt, completedAt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        enrollmentId,
        orgId,
        studentId,
        programId,
        packageId,
        enrollmentStatus,
        journey,
        enrolledAt,
        journey === "complete" ? enrolledAt + 30 * 86400000 : null,
        enrolledAt,
        enrolledAt,
      ),
    );

    // Payment for each enrollment
    const paymentStatus = pick(rng, paymentStatuses);
    const platformFee = Math.round(packagePrice * 0.02);
    stmts.push(
      env.DB.prepare(
        `INSERT INTO payment
           (id, organizationId, enrollmentId, studentId, programPackageId,
            kind, status, amountCents, currency, platformFeeCents,
            schoolNetCents, descriptionSnapshot, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, 'one_time', ?, ?, 'USD', ?, ?, ?, ?, ?)`,
      ).bind(
        newId(),
        orgId,
        enrollmentId,
        studentId,
        packageId,
        paymentStatus,
        packagePrice,
        platformFee,
        packagePrice - platformFee,
        isAdult ? "Adult Refresher — 3 Lessons" : (i % 5 === 0 ? "Teen Plus 4 Extra Lessons" : "Standard Teen Package"),
        enrolledAt,
        enrolledAt,
      ),
    );

    students.push({
      id: studentId,
      firstName,
      lastName,
      enrollmentId,
      instructorId: instructors[i % 3]!.id,
      vehicleId: vehicles[i % 4]!,
    });
  }

  // --- Guardians (link 12 of the teen students into 8 households) ----
  for (let i = 0; i < 8; i++) {
    const guardianUserId = newId();
    const guardianFn = pick(rng, FIRST_NAMES);
    const guardianLn = pick(rng, LAST_NAMES);
    const email = `${guardianFn.toLowerCase()}.${guardianLn.toLowerCase().replace(/[^a-z]/g, "")}.parent@${slug}.demo`;
    stmts.push(
      env.DB.prepare(
        `INSERT INTO user (id, email, emailVerified, name, createdAt, updatedAt)
         VALUES (?, ?, 1, ?, ?, ?)`,
      ).bind(guardianUserId, email, `${guardianFn} ${guardianLn}`, now, now),
    );
    const guardianId = newId();
    stmts.push(
      env.DB.prepare(
        `INSERT INTO guardian
           (id, organizationId, userId, firstName, lastName, phone, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(guardianId, orgId, guardianUserId, guardianFn, guardianLn, randPhone(rng), now),
    );
    stmts.push(
      env.DB.prepare(
        `INSERT INTO member (id, organizationId, userId, role, createdAt)
         VALUES (?, ?, ?, 'parent', ?)`,
      ).bind(newId(), orgId, guardianUserId, now),
    );

    // Link 1-2 students per guardian, biased to the first 16 students (teens).
    const studentA = students[i * 2]!;
    const studentB = students[i * 2 + 1];
    stmts.push(
      env.DB.prepare(
        `INSERT INTO guardianStudent (guardianId, studentId, relationship, createdAt)
         VALUES (?, ?, 'parent', ?)`,
      ).bind(guardianId, studentA.id, now),
    );
    if (studentB && i % 3 === 0) {
      stmts.push(
        env.DB.prepare(
          `INSERT INTO guardianStudent (guardianId, studentId, relationship, createdAt)
           VALUES (?, ?, 'parent', ?)`,
        ).bind(guardianId, studentB.id, now),
      );
    }
  }

  // --- Appointments: 30 days past, 14 days future --------------------
  // For each student, schedule a handful of past lessons (mostly
  // completed, some canceled) plus 1-2 upcoming lessons.
  for (const s of students) {
    const pastCount = 1 + Math.floor(rng() * 4); // 1-4 past
    for (let p = 0; p < pastCount; p++) {
      const daysAgo = 1 + Math.floor(rng() * 30);
      const startsAt = now - daysAgo * 86400000;
      const status = rng() > 0.85 ? "canceled" : rng() > 0.92 ? "no_show" : "completed";
      const apptId = newId();
      const duration = 60 + Math.floor(rng() * 60); // 60-120m
      const isLateCancel = status === "canceled" && rng() > 0.6;
      const isNoShow = status === "no_show";
      stmts.push(
        env.DB.prepare(
          `INSERT INTO appointment
             (id, organizationId, enrollmentId, instructorId, vehicleId,
              kind, status, startsAt, endsAt, locationLabel, notes,
              feeAssessedCents, feeReason, feeStatus, canceledAt,
              locationId, nextLessonFocus, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, 'btw', ?, ?, ?, 'Pickup at school', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          apptId,
          orgId,
          s.enrollmentId,
          s.instructorId,
          s.vehicleId,
          status,
          startsAt,
          startsAt + duration * 60000,
          status === "completed" ? `${pick(rng, PROGRAM_FOCI)}.` : null,
          isLateCancel ? 2500 : isNoShow ? 5000 : 0,
          isLateCancel ? "late_cancel" : isNoShow ? "no_show" : null,
          isLateCancel || isNoShow ? (rng() > 0.5 ? "paid" : "pending") : null,
          status === "canceled" ? startsAt - 6 * 3600000 : null,
          locationId,
          status === "completed" ? pick(rng, PROGRAM_FOCI) : null,
          startsAt - 7 * 86400000,
          startsAt,
        ),
      );
    }

    const futureCount = rng() > 0.4 ? 1 + Math.floor(rng() * 2) : 0;
    for (let f = 0; f < futureCount; f++) {
      const daysFromNow = 1 + Math.floor(rng() * 14);
      const startsAt = now + daysFromNow * 86400000 + Math.floor(rng() * 8) * 3600000;
      const duration = 60 + Math.floor(rng() * 60);
      stmts.push(
        env.DB.prepare(
          `INSERT INTO appointment
             (id, organizationId, enrollmentId, instructorId, vehicleId,
              kind, status, startsAt, endsAt, locationLabel,
              locationId, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, 'btw', ?, ?, ?, 'Pickup at home', ?, ?, ?)`,
        ).bind(
          newId(),
          orgId,
          s.enrollmentId,
          s.instructorId,
          s.vehicleId,
          rng() > 0.3 ? "confirmed" : "scheduled",
          startsAt,
          startsAt + duration * 60000,
          locationId,
          now - 3 * 86400000,
          now,
        ),
      );
    }
  }

  // --- Audit log entries (sampling, last 30 days) -------------------
  const auditActions = [
    ["enrollment.created", "Created enrollment for Alex Brennan"],
    ["payment.succeeded", "Payment captured ($699.00) for Standard Teen Package"],
    ["appointment.scheduled", "Scheduled BTW with Diego Reyes"],
    ["appointment.completed", "Marked appointment complete"],
    ["appointment.canceled", "Family canceled within 24h — late-cancel fee assessed"],
    ["student.imported", "Imported 4 students from CSV"],
    ["instructor.invited", "Invited Carmen Foster as instructor"],
    ["fee.waived", "Late-cancel fee waived (one-time courtesy)"],
    ["credential.eligible", "Student marked permit-eligible"],
  ];
  for (let i = 0; i < 18; i++) {
    const [action, label] = auditActions[i % auditActions.length]!;
    const daysAgo = Math.floor(rng() * 30);
    stmts.push(
      env.DB.prepare(
        `INSERT INTO auditLog
           (id, organizationId, actorUserId, action, entityType, entityId,
            payload, createdAt)
         VALUES (?, ?, ?, ?, 'demo', ?, ?, ?)`,
      ).bind(
        newId(),
        orgId,
        userId,
        action,
        newId(),
        JSON.stringify({ label }),
        now - daysAgo * 86400000 - Math.floor(rng() * 86400000),
      ),
    );
  }

  // Execute it all.
  await env.DB.batch(stmts);

  return { organizationId: orgId, userId, slug, expiresAt };
}

/**
 * Daily sweep: delete demo orgs past expiry. Cascades clean up all
 * tenant-scoped rows. Called from the existing hourly cron.
 */
export async function sweepExpiredDemos(env: Env): Promise<{ swept: number }> {
  const now = Date.now();
  const rows = await env.DB.prepare(
    `SELECT id FROM organization WHERE isDemo = 1 AND demoExpiresAt IS NOT NULL AND demoExpiresAt < ?`,
  )
    .bind(now)
    .all<{ id: string }>();

  if (!rows.results.length) return { swept: 0 };

  const stmts = rows.results.map((r) =>
    env.DB.prepare("DELETE FROM organization WHERE id = ?").bind(r.id),
  );
  await env.DB.batch(stmts);
  return { swept: rows.results.length };
}
