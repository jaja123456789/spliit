'use client'
import { CategoryIcon } from '@/app/groups/[groupId]/expenses/category-icon'
import {
  ReceiptExtractedInfo,
  extractExpenseInformationFromImage,
} from '@/app/groups/[groupId]/expenses/create-from-receipt-button-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { ToastAction } from '@/components/ui/toast'
import { useToast } from '@/components/ui/use-toast'
import { useMediaQuery } from '@/lib/hooks'
import {
  formatCurrency,
  formatDate,
  formatFileSize,
  getCurrencyFromGroup,
} from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { ChevronRight, FileQuestion, Loader2, Receipt } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { getImageData, usePresignedUpload } from 'next-s3-upload'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { PropsWithChildren, ReactNode, useState } from 'react'
import { useCurrentGroup } from '../current-group-context'

const MAX_FILE_SIZE = 10 * 1024 ** 2

export function CreateFromReceiptButton() {
  const t = useTranslations('CreateFromReceipt')
  const isDesktop = useMediaQuery('(min-width: 640px)')
  const DialogOrDrawer = isDesktop
    ? CreateFromReceiptDialog
    : CreateFromReceiptDrawer

  return (
    <DialogOrDrawer
      trigger={
        <Button
          size="icon"
          variant="secondary"
          title={t('Dialog.triggerTitle')}
        >
          <Receipt className="w-4 h-4" />
        </Button>
      }
      title={
        <>
          <span>{t('Dialog.title')}</span>
          <Badge className="bg-pink-700 hover:bg-pink-600 dark:bg-pink-500 dark:hover:bg-pink-600">
            Beta
          </Badge>
        </>
      }
      description={<>{t('Dialog.description')}</>}
    >
      <ReceiptDialogContent />
    </DialogOrDrawer>
  )
}

function ReceiptDialogContent() {
  const { group } = useCurrentGroup()
  const { data: categoriesData } = trpc.categories.list.useQuery()
  const categories = categoriesData?.categories
  const locale = useLocale()
  const t = useTranslations('CreateFromReceipt')
  const [pending, setPending] = useState(false)
  const { uploadToS3, FileInput, openFileDialog } = usePresignedUpload()
  const { toast } = useToast()
  const router = useRouter()
  const [receiptInfo, setReceiptInfo] = useState<
    | null
    | (ReceiptExtractedInfo & { url?: string; width?: number; height?: number; blobUrl: string })
  >(null)

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => {
        const result = reader.result as string
        const base64 = result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
    })
  }

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = (event) => {
        const img = document.createElement('img')
        img.src = event.target?.result as string
        img.onload = () => {
          const canvas = document.createElement('canvas')
          // Resize large images to max 1024px dimension for faster AI processing
          const MAX_DIMENSION = 1024
          let width = img.width
          let height = img.height

          if (width > height) {
            if (width > MAX_DIMENSION) {
              height *= MAX_DIMENSION / width
              width = MAX_DIMENSION
            }
          } else {
            if (height > MAX_DIMENSION) {
              width *= MAX_DIMENSION / height
              height = MAX_DIMENSION
            }
          }

          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('Could not get canvas context'))
            return
          }
          
          ctx.drawImage(img, 0, 0, width, height)
          // Compress to JPEG with 0.7 quality
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
          resolve(dataUrl.split(',')[1]) // Return base64 without prefix
        }
        img.onerror = (error) => reject(error)
      }
      reader.onerror = (error) => reject(error)
    })
  }

  const handleFileChange = async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: t('TooBigToast.title'),
        description: t('TooBigToast.description', {
          maxSize: formatFileSize(MAX_FILE_SIZE, locale),
          size: formatFileSize(file.size, locale),
        }),
        variant: 'destructive',
      })
      return
    }

    const process = async () => {
      try {
        setPending(true)
        const blobUrl = URL.createObjectURL(file)
        const { width, height } = await getImageData(file)
        
        // Parallelize upload and analysis
        const compressedBase64 = await compressImage(file)
        const analysisPromise = extractExpenseInformationFromImage(compressedBase64, "image/jpeg")
        
        // Attempt upload but don't crash if it fails (feature should arguably work even without S3)
        const uploadPromise = uploadToS3(file).catch(err => {
          console.warn("S3 Upload failed:", err)
          return null
        })

        const [info, uploadResult] = await Promise.all([analysisPromise, uploadPromise])
        
        setReceiptInfo({ 
          ...info, 
          url: uploadResult?.url, 
          width, 
          height, 
          blobUrl 
        })
      } catch (err) {
        console.error(err)
        toast({
          title: t('ErrorToast.title'),
          description: t('ErrorToast.description'),
          variant: 'destructive',
          action: (
            <ToastAction
              altText={t('ErrorToast.retry')}
              onClick={() => process()}
            >
              {t('ErrorToast.retry')}
            </ToastAction>
          ),
        })
      } finally {
        setPending(false)
      }
    }
    process()
  }

  const receiptInfoCategory =
    (receiptInfo?.categoryId &&
      categories?.find((c) => String(c.id) === String(receiptInfo.categoryId))) ||
    null

  return (
    <div className="prose prose-sm dark:prose-invert">
      <p>{t('Dialog.body')}</p>
      <div>
        {/* @ts-ignore */}
        <FileInput onChange={handleFileChange} accept="image/*" capture="environment" />
        <div className="grid gap-x-4 gap-y-2 grid-cols-3">
          <Button
            variant="secondary"
            className="row-span-4 w-full h-full relative"
            title="Create expense from receipt"
            onClick={openFileDialog}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="w-8 h-8 animate-spin" />
            ) : receiptInfo ? (
              <div className="absolute top-2 left-2 bottom-2 right-2">
                <Image
                  src={receiptInfo.blobUrl}
                  width={receiptInfo.width}
                  height={receiptInfo.height}
                  className="w-full h-full m-0 object-contain drop-shadow-lg"
                  alt="Scanned receipt"
                />
              </div>
            ) : (
              <span className="text-xs sm:text-sm text-muted-foreground text-center">
                {t('Dialog.selectImage')}
              </span>
            )}
          </Button>
          <div className="col-span-2">
            <strong>{t('Dialog.titleLabel')}</strong>
            <div className="truncate">{receiptInfo ? receiptInfo.title ?? <Unknown /> : '…'}</div>
          </div>
          <div className="col-span-2">
            <strong>{t('Dialog.categoryLabel')}</strong>
            <div>
              {receiptInfo ? (
                receiptInfoCategory ? (
                  <div className="flex items-center">
                    <CategoryIcon
                      category={receiptInfoCategory}
                      className="inline w-4 h-4 mr-2"
                    />
                    <span className="mr-1 truncate">{receiptInfoCategory.grouping}</span>
                    <ChevronRight className="inline w-3 h-3 mr-1" />
                    <span className="truncate">{receiptInfoCategory.name}</span>
                  </div>
                ) : (
                  <Unknown />
                )
              ) : (
                ''
              )}
            </div>
          </div>
          <div>
            <strong>{t('Dialog.amountLabel')}</strong>
            <div>
              {receiptInfo && group ? (
                receiptInfo.amount ? (
                  <>
                    {formatCurrency(
                      getCurrencyFromGroup(group),
                      receiptInfo.amount,
                      locale,
                      true,
                    )}
                  </>
                ) : (
                  <Unknown />
                )
              ) : (
                '…'
              )}
            </div>
          </div>
          <div>
            <strong>{t('Dialog.dateLabel')}</strong>
            <div>
              {receiptInfo ? (
                receiptInfo.date ? (
                  formatDate(
                    new Date(`${receiptInfo?.date}T12:00:00.000Z`),
                    locale,
                    { dateStyle: 'medium' },
                  )
                ) : (
                  <Unknown />
                )
              ) : (
                '…'
              )}
            </div>
          </div>
          <div className="col-span-2">
            <strong>Items found</strong>
            <div>
              {receiptInfo?.items?.length ? (
                <Badge variant="outline">{receiptInfo.items.length} items</Badge>
              ) : (
                receiptInfo ? <span className="text-muted-foreground italic">None</span> : '…'
              )}
            </div>
          </div>
        </div>
      </div>
      <p>{t('Dialog.editNext')}</p>
      <div className="text-center">
        <Button
          disabled={pending || !receiptInfo}
          onClick={() => {
            if (!receiptInfo || !group) return
            
            // Only attach documents if upload succeeded
            const documents = receiptInfo.url ? [{
              id: crypto.randomUUID(),
              url: receiptInfo.url,
              width: receiptInfo.width,
              height: receiptInfo.height
            }] : []

            const receiptData = {
              ...receiptInfo,
              documents
            }
            sessionStorage.setItem('pendingReceiptData', JSON.stringify(receiptData))
            router.push(`/groups/${group.id}/expenses/create?fromReceipt=true`)
          }}
        >
          {t('Dialog.continue')}
        </Button>
      </div>
    </div>
  )
}

function Unknown() {
  const t = useTranslations('CreateFromReceipt')
  return (
    <div className="flex gap-1 items-center text-muted-foreground">
      <FileQuestion className="w-4 h-4" />
      <em>{t('unknown')}</em>
    </div>
  )
}

function CreateFromReceiptDialog({
  trigger,
  title,
  description,
  children,
}: PropsWithChildren<{
  trigger: ReactNode
  title: ReactNode
  description: ReactNode
}>) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{title}</DialogTitle>
          <DialogDescription className="text-left">
            {description}
          </DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

function CreateFromReceiptDrawer({
  trigger,
  title,
  description,
  children,
}: PropsWithChildren<{
  trigger: ReactNode
  title: ReactNode
  description: ReactNode
}>) {
  return (
    <Drawer>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">{title}</DrawerTitle>
          <DrawerDescription className="text-left">
            {description}
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-4">{children}</div>
      </DrawerContent>
    </Drawer>
  )
}