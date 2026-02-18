import { Currency } from './currency'

export type PaymentProfile = {
  venmo?: string
  paypal?: string
  cashapp?: string
  revolut?: string
  phone?: string
}

export type PaymentOption = {
  type: 'link' | 'copy'
  label: string
  value: string // URL or copy text
  color: string
  bgColor: string
  textColor: string
  icon?: 'external-link' | 'copy' | 'phone' | 'landmark'
}

export function getPaymentOptions(
  profile: PaymentProfile | null, 
  amount: number, 
  currency: Currency,
  note: string = "Spliit Expense"
): PaymentOption[] {
  if (!profile) return []

  const options: PaymentOption[] = []
  
  // Format amount: 1050 (cents) -> 10.50
  // We use .toFixed(2) to ensure standard currency format
  const decimalAmount = amount / (10 ** currency.decimal_digits)
  const fmtAmount = decimalAmount.toFixed(2)

  // PayPal
  // Format: https://paypal.me/user/10.50USD
  if (profile.paypal) {
    const cleanHandle = profile.paypal.replace(/^@/, '')
     options.push({
      type: 'link',
      label: 'PayPal',
      value: `https://paypal.me/${cleanHandle}/${fmtAmount}${currency.code}`,
      color: '#003087',
      bgColor: 'bg-[#003087]',
      textColor: 'text-white',
      icon: 'external-link'
    })
  }

  // Venmo
  // Format: https://venmo.com/?txn=pay&recipients=user&amount=10.50&note=...
  if (profile.venmo) {
    const cleanHandle = profile.venmo.replace(/^@/, '')
    const params = new URLSearchParams({
      txn: 'pay',
      recipients: cleanHandle,
      amount: fmtAmount,
      note: note
    })
    options.push({
      type: 'link',
      label: 'Venmo',
      value: `https://venmo.com/?${params.toString()}`,
      color: '#008CFF',
      bgColor: 'bg-[#008CFF]',
      textColor: 'text-white',
      icon: 'external-link'
    })
  }

  if (profile.phone) {
    options.push({
      type: 'copy',
      label: 'Phone',
      value: profile.phone,
      color: '#71717a', // Zinc-500
      bgColor: 'bg-zinc-100 dark:bg-zinc-800',
      textColor: 'text-zinc-900 dark:text-zinc-100',
      icon: 'phone'
    })
  }

  // Cash App
  // Format: https://cash.app/$user/10.50
  if (profile.cashapp) {
    // Ensure handle starts with $ just in case, though standard URL usually uses just the name part after /
    // Actually cash.app URL structure is cash.app/$handle/amount
    let handle = profile.cashapp
    if (!handle.startsWith('$')) handle = `$${handle}`
    
    options.push({
      type: 'link',
      label: 'Cash App',
      value: `https://cash.app/${handle}/${fmtAmount}`,
      color: '#00D632',
      bgColor: 'bg-[#00D632]',
      textColor: 'text-white',
      icon: 'external-link'
    })
  }

  // Revolut
  // Format: https://revolut.me/user?currency=usd&amount=1000
  if (profile.revolut) {
    const cleanHandle = profile.revolut.replace(/^@/, '')
    options.push({
      type: 'link',
      label: 'Revolut',
      value: `https://revolut.me/${cleanHandle}?currency=${currency.code.toLowerCase()}&amount=${amount}`, 
      color: '#0075EB',
      bgColor: 'bg-[#0075EB]',
      textColor: 'text-white',
      icon: 'external-link'
    })
  }

  return options
}