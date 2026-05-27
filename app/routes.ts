import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("signup", "routes/signup.tsx"),
  route("logout", "routes/logout.tsx"),
  route("onboarding", "routes/onboarding.tsx"),
  route("api/auth/*", "routes/api.auth.tsx"),

  route("admin", "routes/admin.tsx", [
    index("routes/admin._index.tsx"),
    route("students", "routes/admin.students.tsx"),
    route("students/new", "routes/admin.students.new.tsx"),
    route("students/:studentId", "routes/admin.students.$studentId.tsx"),
    route("schedule", "routes/admin.schedule.tsx"),
    route("programs", "routes/admin.programs.tsx"),
    route("programs/new", "routes/admin.programs.new.tsx"),
    route("programs/:programId", "routes/admin.programs.$programId.tsx"),
    route("settings", "routes/admin.settings.tsx"),
  ]),

  route("me", "routes/me.tsx", [
    index("routes/me._index.tsx"),
    route("schedule", "routes/me.schedule.tsx"),
  ]),
] satisfies RouteConfig;
