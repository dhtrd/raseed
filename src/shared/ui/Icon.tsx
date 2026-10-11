import type { SVGProps } from "react";

const PATHS = {
  calendar: (
    <>
      <rect
        x="2.5"
        y="4"
        width="15"
        height="13.5"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M2.5 8h15M6.5 2v4M13.5 2v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  // في RTL: «السابق» يشير يميناً و«التالي» يساراً
  prev: (
    <path
      d="M7.5 3.75l6.25 6.25-6.25 6.25"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  next: (
    <path
      d="M12.5 3.75L6.25 10l6.25 6.25"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  prev2: (
    <path
      d="M3.75 3.75L10 10l-6.25 6.25M10 3.75L16.25 10 10 16.25"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  next2: (
    <path
      d="M16.25 3.75L10 10l6.25 6.25M10 3.75L3.75 10 10 16.25"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  tick: (
    <path
      d="M4 10.5l4 4 8-9"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  eye: (
    <>
      <path
        d="M1.8 10S5 4 10 4s8.2 6 8.2 6-3.2 6-8.2 6-8.2-6-8.2-6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="10" cy="10" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  eyeOff: (
    <>
      <path
        d="M1.8 10S5 4 10 4s8.2 6 8.2 6-3.2 6-8.2 6-8.2-6-8.2-6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M3 17L17 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  search: (
    <>
      <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M13 13l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  reverse: (
    <path
      d="M5 8a6 6 0 1 1 1 7M5 3v5h5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" {...rest}>
      {PATHS[name]}
    </svg>
  );
}

/** مسار رمز الريال السعودي الرسمي (U+20C1)؛ مشترك مع صورة الرمز في ملفات Excel. */
export const RIYAL_PATH =
  "M750,1119 C730,1163,716,1211,711,1262 C711,1262,1136,1172,1136,1172 C1156,1127,1169,1079,1174,1028 C1174,1028,750,1119,750,1119Z M1136,901 C1136,901,1136,901,1136,901 C1156,857,1169,809,1174,758 C1174,758,843,828,843,828 C843,828,843,693,843,693 C843,693,1136,631,1136,631 C1156,587,1169,538,1174,488 C1174,488,843,558,843,558 C843,558,843,72,843,72 C793,100,748,138,711,183 C711,183,711,586,711,586 C711,586,579,614,579,614 C579,614,579,6,579,6 C528,34,483,72,447,117 C447,117,447,642,447,642 C447,642,151,705,151,705 C131,750,117,798,112,849 C112,849,447,777,447,777 C447,777,447,948,447,948 C447,948,88,1024,88,1024 C68,1068,55,1117,50,1167 C50,1167,425,1088,425,1088 C456,1081,482,1063,499,1038 C499,1038,568,936,568,936 C568,936,568,936,568,936 C575,926,579,913,579,899 C579,899,579,749,579,749 C579,749,711,721,711,721 C711,721,711,992,711,992 C711,992,1136,901,1136,901Z";

/** رمز الريال السعودي الرسمي (U+20C1) كمسار SVG. */
export function Riyal(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="40 0 1145 1270" role="img" aria-label="ريال سعودي" focusable="false" {...props}>
      <path fill="currentColor" d={RIYAL_PATH} />
    </svg>
  );
}
