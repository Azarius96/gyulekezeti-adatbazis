import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function base(children: React.ReactNode, props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={22}
      height={22}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconDashboard(props: IconProps) {
  return base(
    <>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.8" />
      <rect x="13" y="3.5" width="7.5" height="4.5" rx="1.8" />
      <rect x="13" y="10" width="7.5" height="10.5" rx="1.8" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.8" />
    </>,
    props
  );
}

export function IconHome(props: IconProps) {
  return base(
    <>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 9.5V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.5" />
      <path d="M9.5 20v-5.5a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5V20" />
    </>,
    props
  );
}

export function IconWallet(props: IconProps) {
  return base(
    <>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
      <path d="M4 9h13.5A2.5 2.5 0 0 1 20 11.5v1A2.5 2.5 0 0 1 17.5 15H16a1.8 1.8 0 0 1 0-3.6h4" />
    </>,
    props
  );
}

export function IconCross(props: IconProps) {
  return base(
    <>
      <path d="M12 3.5v9M12 21v-4" />
      <path d="M8 7h8" />
      <path d="M9 21h6" />
      <path d="M12 12.5v0" />
      <rect x="7" y="12" width="10" height="9" rx="1.4" />
    </>,
    props
  );
}

export function IconChurch(props: IconProps) {
  return base(
    <>
      <path d="M12 3v2.5M10.7 4.3h2.6" />
      <path d="M12 5.5 19 11v9H5v-9z" />
      <path d="M9.5 20v-5.5A1 1 0 0 1 10.5 13.5h3a1 1 0 0 1 1 1V20" />
      <path d="M5 15.5 2.5 17M19 15.5 21.5 17" />
    </>,
    props
  );
}

export function IconOrgChart(props: IconProps) {
  return base(
    <>
      <rect x="9" y="3.5" width="6" height="4.5" rx="1.2" />
      <rect x="3.5" y="16" width="6" height="4.5" rx="1.2" />
      <rect x="14.5" y="16" width="6" height="4.5" rx="1.2" />
      <path d="M12 8v4M6.5 16v-2a1.5 1.5 0 0 1 1.5-1.5h8a1.5 1.5 0 0 1 1.5 1.5v2" />
    </>,
    props
  );
}

export function IconUsers(props: IconProps) {
  return base(
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20v-1.5A3.5 3.5 0 0 1 7 15h4a3.5 3.5 0 0 1 3.5 3.5V20" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M15.5 15.2A3.2 3.2 0 0 1 20.5 18V20" />
    </>,
    props
  );
}

export function IconUpload(props: IconProps) {
  return base(
    <>
      <path d="M12 15.5v-10M8 9l4-4 4 4" />
      <path d="M5 15.5v3A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-3" />
    </>,
    props
  );
}

export function IconDownload(props: IconProps) {
  return base(
    <>
      <path d="M12 4.5v10M8 10.5l4 4 4-4" />
      <path d="M5 15.5v3A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-3" />
    </>,
    props
  );
}

export function IconHistory(props: IconProps) {
  return base(
    <>
      <path d="M4 12a8 8 0 1 1 2.5 5.8" />
      <path d="M4 12V7M4 12h5" />
      <path d="M12 8v4.5l3 2" />
    </>,
    props
  );
}

export function IconLogout(props: IconProps) {
  return base(
    <>
      <path d="M9 20H6a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 6 4h3" />
      <path d="M15.5 16.5 20 12l-4.5-4.5" />
      <path d="M20 12H9" />
    </>,
    props
  );
}

export function IconChevronRight(props: IconProps) {
  return base(<path d="m9 5 7 7-7 7" />, props);
}

export function IconChevronDown(props: IconProps) {
  return base(<path d="m5 9 7 7 7-7" />, props);
}

export function IconSearch(props: IconProps) {
  return base(
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.8-4.8" />
    </>,
    props
  );
}

export function IconMenu(props: IconProps) {
  return base(
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>,
    props
  );
}

export function IconX(props: IconProps) {
  return base(
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </>,
    props
  );
}

export function IconHeart(props: IconProps) {
  return base(
    <path d="M12 20.5s-7.5-4.6-9.8-9.1C.8 8.1 2.3 4.8 5.6 4.1c2-.4 3.9.5 5 2.1a1 1 0 0 0 1.6 0c1.1-1.6 3-2.5 5-2.1 3.3.7 4.8 4 3.4 7.3-2.3 4.5-9.8 9.1-9.8 9.1Z" />,
    props
  );
}

export function IconBell(props: IconProps) {
  return base(
    <>
      <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5Z" />
      <path d="M10 19.5a2 2 0 0 0 4 0" />
    </>,
    props
  );
}

export function IconClock(props: IconProps) {
  return base(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>,
    props
  );
}

export function IconPlus(props: IconProps) {
  return base(<path d="M12 5v14M5 12h14" />, props);
}

export function IconTrash(props: IconProps) {
  return base(
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12" />
      <path d="M10 11v6M14 11v6" />
    </>,
    props
  );
}

export function IconLock(props: IconProps) {
  return base(
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>,
    props
  );
}

export function IconLockOpen(props: IconProps) {
  return base(
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.4-1.8" />
    </>,
    props
  );
}

export function IconBook(props: IconProps) {
  return base(
    <>
      <path d="M12 6.5c-1.5-1.3-3.4-2-6-2v13c2.6 0 4.5.7 6 2 1.5-1.3 3.4-2 6-2v-13c-2.6 0-4.5.7-6 2Z" />
      <path d="M12 6.5v13" />
    </>,
    props
  );
}

export function IconDroplet(props: IconProps) {
  return base(
    <>
      <path d="M12 3.5c3 4 6 8.2 6 11.5a6 6 0 1 1-12 0c0-3.3 3-7.5 6-11.5Z" />
    </>,
    props
  );
}

export function IconRings(props: IconProps) {
  return base(
    <>
      <circle cx="9" cy="14" r="4.5" />
      <circle cx="15" cy="14" r="4.5" />
    </>,
    props
  );
}

export function IconGift(props: IconProps) {
  return base(
    <>
      <rect x="4" y="9.5" width="16" height="4" rx="1" />
      <rect x="5.5" y="13.5" width="13" height="7" rx="1" />
      <path d="M12 9.5v11" />
      <path d="M12 9.5c-1-2.8-3-4-4.3-3.2-1.3.8-.7 3.2 4.3 3.2Z" />
      <path d="M12 9.5c1-2.8 3-4 4.3-3.2 1.3.8.7 3.2-4.3 3.2Z" />
    </>,
    props
  );
}

export function IconMapPin(props: IconProps) {
  return base(
    <>
      <path d="M12 21s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.5" />
    </>,
    props
  );
}
