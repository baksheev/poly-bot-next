import { LogOut } from "lucide-react";

import { logout } from "../model/actions";

export function LogoutButton() {
  return (
    <form action={logout}>
      <button className="logout-button" type="submit">
        <LogOut aria-hidden="true" size={13} />
        Sign out
      </button>
    </form>
  );
}
