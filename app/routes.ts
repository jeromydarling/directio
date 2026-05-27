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
    route("schedule", "routes/admin.schedule.tsx"),
    route("programs", "routes/admin.programs.tsx"),
    route("settings", "routes/admin.settings.tsx"),
  ]),
] satisfies RouteConfig;
