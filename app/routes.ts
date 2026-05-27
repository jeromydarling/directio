import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("signup", "routes/signup.tsx"),
  route("logout", "routes/logout.tsx"),
  route("onboarding", "routes/onboarding.tsx"),
  route("api/auth/*", "routes/api.auth.tsx"),
  route("assets/*", "routes/assets.$.tsx"),

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
    route("library", "routes/admin.library.tsx"),
    route("library/installed/:installId", "routes/admin.library.installed.$installId.tsx"),
    route(
      "library/installed/:installId/lessons/:lessonId",
      "routes/admin.library.installed.$installId.lessons.$lessonId.tsx",
    ),
    route("settings", "routes/admin.settings.tsx"),
  ]),

  route("me", "routes/me.tsx", [
    index("routes/me._index.tsx"),
    route("schedule", "routes/me.schedule.tsx"),
    route("learn", "routes/me.learn._index.tsx"),
    route("learn/:lessonId", "routes/me.learn.$lessonId.tsx"),
  ]),
] satisfies RouteConfig;
