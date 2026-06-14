import { Outlet } from "@tanstack/react-router";

export function RootLayout() {
  return (
    <div className="app">
      <Outlet />
    </div>
  );
}
