import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("signup", "routes/signup.tsx"),
  route("logout", "routes/logout.tsx"),
  route("onboarding", "routes/onboarding.tsx"),
  route("api/auth/*", "routes/api.auth.tsx"),
  route("api/stripe/webhook", "routes/api.stripe.webhook.tsx"),
  route("assets/*", "routes/assets.$.tsx"),
  route("schools/:slug", "routes/schools.$slug.tsx"),
  route("schools/:slug/enroll", "routes/schools.$slug.enroll.tsx"),

  route("admin", "routes/admin.tsx", [
    index("routes/admin._index.tsx"),
    route("students", "routes/admin.students.tsx"),
    route("students/new", "routes/admin.students.new.tsx"),
    route("students/:studentId", "routes/admin.students.$studentId.tsx"),
    route("instructors", "routes/admin.instructors.tsx"),
    route("instructors/new", "routes/admin.instructors.new.tsx"),
    route("instructors/:instructorId", "routes/admin.instructors.$instructorId.tsx"),
    route("vehicles", "routes/admin.vehicles.tsx"),
    route("schedule", "routes/admin.schedule.tsx"),
    route("schedule/new", "routes/admin.schedule.new.tsx"),
    route("programs", "routes/admin.programs.tsx"),
    route("programs/new", "routes/admin.programs.new.tsx"),
    route("programs/:programId", "routes/admin.programs.$programId.tsx"),
    route("payments", "routes/admin.payments.tsx"),
    route("onboarding", "routes/admin._onboarding.tsx"),
    route("import", "routes/admin.import.tsx"),
    route("reminders", "routes/admin.reminders.tsx"),
    route("library", "routes/admin.library.tsx"),
    route("library/media", "routes/admin.library.media.tsx"),
    route("library/places", "routes/admin.library.places.tsx"),
    route("library/installed/:installId", "routes/admin.library.installed.$installId.tsx"),
    route(
      "library/installed/:installId/lessons/:lessonId",
      "routes/admin.library.installed.$installId.lessons.$lessonId.tsx",
    ),
    route("settings", "routes/admin.settings.tsx"),
    route("settings/payments", "routes/admin.settings.payments.tsx"),
    route("settings/btw-flow", "routes/admin.settings.btw-flow.tsx"),
    route("settings/public-listing", "routes/admin.settings.public-listing.tsx"),
  ]),

  route("instructor", "routes/instructor.tsx", [
    index("routes/instructor._index.tsx"),
    route("upcoming", "routes/instructor.upcoming.tsx"),
    route("past", "routes/instructor.past.tsx"),
    route("availability", "routes/instructor.availability.tsx"),
  ]),

  route("family", "routes/family.tsx", [
    index("routes/family._index.tsx"),
    route("payments", "routes/family.payments.tsx"),
    route("documents", "routes/family.documents.tsx"),
  ]),

  route("me", "routes/me.tsx", [
    index("routes/me._index.tsx"),
    route("schedule", "routes/me.schedule.tsx"),
    route("learn", "routes/me.learn._index.tsx"),
    route("learn/:lessonId", "routes/me.learn.$lessonId.tsx"),
    route("checkout/:enrollmentId", "routes/me.checkout.$enrollmentId.tsx"),
    route("find-school", "routes/me.find-school.tsx"),
    route("help", "routes/me.help.tsx"),
  ]),
] satisfies RouteConfig;
