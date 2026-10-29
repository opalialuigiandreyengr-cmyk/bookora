import type { User } from "@supabase/supabase-js"
import { CalendarPage } from "@/pages/CalendarPage"

type Props = { user: User; businessId: string; role: string }

export function StaffWorkspacePage({ user, businessId, role }: Props) {
  const calendarUser = {
    ...user,
    id: businessId,
    user_metadata: {
      ...user.user_metadata,
      business_name: user.user_metadata?.business_name || "Assigned business",
      staff_role: role,
    },
  } as User

  return <CalendarPage user={calendarUser} onSignOut={() => undefined} staffMode />
}
