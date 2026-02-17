import { Currency } from './currency'

export type PaymentProfile = {
  venmo?: string
  paypal?: string
  cashapp?: string
  revolut?: string
}

export type PaymentLink = {
  provider: string
  url: string
  color: string
  bgColor: string
  textColor: string
}

export function getPaymentLinks(
  profile: PaymentProfile | null, 
  amount: number, 
  currency: Currency,
  note: string = "Spliit Expense"
): PaymentLink[] {
  if (!profile) return []

  const links: PaymentLink[] = []
  
  // Format amount: 1050 (cents) -> 10.50
  // We use .toFixed(2) to ensure standard currency format
  const decimalAmount = amount / (10 ** currency.decimal_digits)
  const fmtAmount = decimalAmount.toFixed(2)

  // PayPal
  // Format: https://paypal.me/user/10.50USD
  if (profile.paypal) {
    const cleanHandle = profile.paypal.replace(/^@/, '')
    links.push({
      provider: 'PayPal',
      url: `https://paypal.me/${cleanHandle}/${fmtAmount}${currency.code}`,
      color: '#003087',
      bgColor: 'bg-[#003087]',
      textColor: 'text-white'
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
    links.push({
      provider: 'Venmo',
      url: `https://venmo.com/?${params.toString()}`,
      color: '#008CFF',
      bgColor: 'bg-[#008CFF]',
      textColor: 'text-white'
    })
  }

  // Cash App
  // Format: https://cash.app/$user/10.50
  if (profile.cashapp) {
    // Ensure handle starts with $ just in case, though standard URL usually uses just the name part after /
    // Actually cash.app URL structure is cash.app/$handle/amount
    let handle = profile.cashapp
    if (!handle.startsWith('$')) handle = `$${handle}`
    
    links.push({
      provider: 'Cash App',
      url: `https://cash.app/${handle}/${fmtAmount}`,
      color: '#00D632',
      bgColor: 'bg-[#00D632]',
      textColor: 'text-white'
    })
  }

  // Revolut
  // Format: https://revolut.me/user?currency=usd&amount=1000
  if (profile.revolut) {
    const cleanHandle = profile.revolut.replace(/^@/, '')
    links.push({
      provider: 'Revolut',
      url: `https://revolut.me/${cleanHandle}?currency=${currency.code.toLowerCase()}&amount=${amount}`, 
      color: '#0075EB',
      bgColor: 'bg-[#0075EB]',
      textColor: 'text-white'
    })
  }

  return links
}