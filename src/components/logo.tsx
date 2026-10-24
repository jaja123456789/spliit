import { cn } from '@/lib/utils'

/**
 * The mark — scissors through a banknote — drawn from `public/logo.svg` in the theme's own colours,
 * with the name set as text beside it.
 *
 * The header used to show `logo-with-text.png`: a raster whose pink-red scissor handles (#ED5167)
 * were the only saturated red on screen apart from the destructive colour, and the first thing the
 * eye landed on in every screenshot. Here the note keeps the green, because a banknote is money and
 * money is what green means in this scheme. The handles are ink, the blades two steps of the
 * secondary inks, the rivet the ground. Every fill is a token, so the dark theme comes for free.
 *
 * The PNGs stay where an image is the only option: the iOS splash, the share banner and the app
 * icons, which the platforms rasterise from files.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <svg
        viewBox="0 0 512 512"
        aria-hidden="true"
        className="h-8 w-8 shrink-0"
      >
        <path
          className="fill-muted-foreground"
          d="M261.25,134.9h0a76.62,76.62,0,0,1,76.62,76.62V423.22a0,0,0,0,1,0,0H261.25a0,0,0,0,1,0,0V134.9a0,0,0,0,1,0,0Z"
          transform="translate(285.06 -130.08) rotate(45)"
        />
        <path
          className="fill-foreground"
          d="M161.87,470.93l75.07-75.08a17.06,17.06,0,0,0,0-24.14l-40.19-40.19a17.06,17.06,0,0,0-24.14,0l-10.8,10.8a91,91,0,0,0-129.58.92c-34.17,35.14-34.17,91.69,0,126.83a91,91,0,0,0,129.58.92ZM57,447.11a57.21,57.21,0,1,1,80.9,0A57.22,57.22,0,0,1,57,447.11Z"
        />
        <rect
          className="fill-primary"
          height="253.49"
          rx="47.61"
          transform="translate(511.66 282.22) rotate(180)"
          width="344.78"
          x="83.44"
          y="14.36"
        />
        <path
          className="fill-primary-foreground/25"
          d="M126,184.86V97.36a40.46,40.46,0,0,0,40.46-40.45H345.23a40.44,40.44,0,0,0,40.44,40.45v87.5a40.44,40.44,0,0,0-40.44,40.44H166.44A40.46,40.46,0,0,0,126,184.86Z"
        />
        <circle className="fill-primary" cx="255.83" cy="141.11" r="60.11" />
        <circle className="fill-primary" cx="349.72" cy="141.11" r="21.88" />
        <circle className="fill-primary" cx="161.94" cy="141.11" r="21.88" />
        <path
          className="fill-subtle-foreground"
          d="M174.13,134.9h76.62a0,0,0,0,1,0,0V346.61a76.62,76.62,0,0,1-76.62,76.62h0a0,0,0,0,1,0,0V134.9a0,0,0,0,1,0,0Z"
          transform="translate(559.99 326.17) rotate(135)"
        />
        <path
          className="fill-foreground"
          d="M350.19,471a91,91,0,0,0,129.58-.92c34.17-35.14,34.17-91.69,0-126.83a91,91,0,0,0-129.58-.92l-10.8-10.8a17.06,17.06,0,0,0-24.14,0l-40.19,40.19a17.06,17.06,0,0,0,0,24.14l75.07,75.08Zm23.89-23.88a57.21,57.21,0,1,1,80.9,0A57.2,57.2,0,0,1,374.08,447.11Z"
        />
        <circle className="fill-background" cx="256" cy="322.62" r="20.01" />
      </svg>
      <span className="text-xl font-extrabold tracking-tight text-foreground">
        Spliit
      </span>
    </span>
  )
}
