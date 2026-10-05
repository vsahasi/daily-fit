import Link from "next/link";
import { PhoneNotify } from "@/components/phone-notify";
import { saveSettings, signOut } from "@/app/actions";
import { PageIntro } from "@/components/page-intro";
import { Shell } from "@/components/shell";
import { WhereYouAre } from "@/components/where-you-are";
import { getCurrentUser } from "@/lib/user";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const shortcutUrl = `${appUrl}/api/location?secret=${user.shortcutSecret}`;

  return (
    <Shell>
      <div className="max-w-lg">
        <PageIntro title="Account">
          <p>Where you are, when the look arrives, and the phone it arrives on.</p>
        </PageIntro>

        <section className="mb-12">
          <h2 className="mb-3 font-sans text-[12px] tracking-[-0.01em] text-mute">Signed in as</h2>
          <p className="text-[14px]">{user.phone ?? "No phone on file"}</p>
          <form action={signOut} className="mt-4">
            <button type="submit" className="btn btn-ghost">
              Sign out
            </button>
          </form>
        </section>

        <section className="mb-12">
          <h2 className="mb-3 font-sans text-[12px] tracking-[-0.01em] text-mute">Location</h2>
          <WhereYouAre city={user.locationLabel} />
        </section>

        <form action={saveSettings} className="flex flex-col gap-6">
          <label className="flex flex-col gap-2 text-[12px] text-mute">
            Hour the look arrives (0–23)
            <input
              name="sendHour"
              type="number"
              min={0}
              max={23}
              defaultValue={user.sendHour}
              className="field"
            />
            <span className="max-w-[44ch] text-[12px] leading-[18px]">
              Before 4pm it dresses you for that day. From 4pm on it dresses you for tomorrow, and asks
              which of today&rsquo;s pieces need a wash.
            </span>
          </label>
          <label className="flex flex-col gap-2 text-[12px] text-mute">
            Days in wash
            <input
              name="washDays"
              type="number"
              min={1}
              max={14}
              defaultValue={user.washDays}
              className="field"
            />
          </label>
          <button type="submit" className="btn self-start">
            Save
          </button>
        </form>

        <section className="mt-12">
          <h2 className="mb-3 font-sans text-[12px] tracking-[-0.01em] text-mute">This phone</h2>
          <p className="mb-3 max-w-[42ch] text-[14px] leading-[22px]">
            One notification carries the look and anything still waiting on a wash. Tap it to open Today.
          </p>
          <PhoneNotify />
        </section>

        <section className="mt-12">
          <h2 className="mb-3 font-sans text-[12px] tracking-[-0.01em] text-mute">More</h2>
          <ul className="space-y-2 text-[14px]">
            <li>
              <Link href="/style" className="underline-offset-4 hover:underline">
                Style
              </Link>
              <span className="text-mute">, what the closet has learned you like</span>
            </li>
            <li>
              <Link href="/shop" className="underline-offset-4 hover:underline">
                New
              </Link>
              <span className="text-mute">, pieces that would fill a gap</span>
            </li>
          </ul>
        </section>
        <section className="mt-14 border-t border-line pt-8">
          <h2 className="text-[22px]">iPhone location overnight</h2>
          <p className="mt-2 text-[14px] leading-[22px] text-mute">
            Optional. A 6:30am Shortcut can post where you are so tomorrow’s forecast is right even if
            you traveled. POST JSON with latitude and longitude to:
          </p>
          <p className="mt-3 break-all text-[12px]">{shortcutUrl}</p>
          <p className="mt-6 text-[14px] leading-[22px] text-mute">
            The same Shortcut can GET this URL and Show Notification, if you would rather not add the
            site to your Home Screen:
          </p>
          <p className="mt-3 break-all text-[12px]">{`${appUrl}/api/look?secret=${user.shortcutSecret}`}</p>
        </section>
      </div>
    </Shell>
  );
}
