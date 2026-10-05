import { Footer } from "@/components/footer";
import { Nav } from "@/components/nav";
import { getOptionalUser } from "@/lib/user";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getOptionalUser();
  return (
    <>
      {user ? <Nav city={user.locationLabel} /> : null}
      <main className="flex-1">{children}</main>
      {user ? <Footer /> : null}
    </>
  );
}
