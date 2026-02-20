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
import {
  Camera,
  FileQuestion,
  ImagePlus,
  Loader2,
  Plus,
  Receipt,
  Trash2,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { getImageData, usePresignedUpload } from 'next-s3-upload'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { PropsWithChildren, ReactNode, useRef, useState } from 'react'
import { useCurrentGroup } from '../current-group-context'

const MAX_FILE_SIZE = 10 * 1024 ** 2

export function CreateFromReceiptButton() {
  const t = useTranslations('CreateFromReceipt')
  const isDesktop = useMediaQuery('(min-width: 1024px)')
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
  const { uploadToS3 } = usePresignedUpload()
  const { toast } = useToast()
  const router = useRouter()

  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  // Accumulated images before analysis
  const [draftImages, setDraftImages] = useState<
    {
      blobUrl: string
      file: File
      width: number | undefined
      height: number | undefined
    }[]
  >([])

  // Result after analysis
  const [receiptInfo, setReceiptInfo] = useState<
    | null
    | (ReceiptExtractedInfo & {
        documents?: { url: string; width: number; height: number; id: string }[]
      })
  >(null)

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = (event) => {
        const img = document.createElement('img')
        img.src = event.target?.result as string
        img.onload = () => {
          const canvas = document.createElement('canvas')
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
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
          resolve(dataUrl.split(',')[1])
        }
        img.onerror = (error) => reject(error)
      }
      reader.onerror = (error) => reject(error)
    })
  }

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const newImages: {
      blobUrl: string
      file: File
      width: number | undefined
      height: number | undefined
    }[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: t('TooBigToast.title'),
          description: t('TooBigToast.description', {
            maxSize: formatFileSize(MAX_FILE_SIZE, locale),
            size: formatFileSize(file.size, locale),
          }),
          variant: 'destructive',
        })
        continue
      }
      try {
        const blobUrl = URL.createObjectURL(file)
        const { width, height } = await getImageData(file)
        newImages.push({ blobUrl, file, width, height })
      } catch (e) {
        console.error('Error reading image', e)
      }
    }

    setDraftImages((prev) => [...prev, ...newImages])
    // Reset inputs so same file can be selected again if needed
    if (cameraInputRef.current) cameraInputRef.current.value = ''
    if (galleryInputRef.current) galleryInputRef.current.value = ''
  }

  const removeDraftImage = (index: number) => {
    setDraftImages((prev) => prev.filter((_, i) => i !== index))
  }

  const analyzeImages = async () => {
    if (draftImages.length === 0) return

    setPending(true)
    setReceiptInfo(null)

    try {
      // 1. Prepare Base64 for AI
      const base64Images = await Promise.all(
        draftImages.map(async (img) => ({
          base64: await compressImage(img.file),
          mimeType: 'image/jpeg',
        })),
      )

      // 2. Start AI Analysis
      const analysisPromise = extractExpenseInformationFromImage(base64Images)

      // 3. Start Uploads
      const uploadPromises = draftImages.map((img) =>
        uploadToS3(img.file)
          .then((res) => ({
            url: res.url,
            width: img.width ?? 0,
            height: img.height ?? 0,
            id: crypto.randomUUID(),
          }))
          .catch((err) => {
            console.warn('Upload failed', err)
            return null
          }),
      )

      const [info, uploadedDocs] = await Promise.all([
        analysisPromise,
        Promise.all(uploadPromises),
      ])

      const validDocs = uploadedDocs.filter(
        (d): d is NonNullable<typeof d> => d !== null,
      )

      setReceiptInfo({
        ...info,
        documents: validDocs,
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
            onClick={() => analyzeImages()}
          >
            {t('ErrorToast.retry')}
          </ToastAction>
        ),
      })
    } finally {
      setPending(false)
    }
  }

  const receiptInfoCategory =
    (receiptInfo?.categoryId &&
      categories?.find(
        (c) => String(c.id) === String(receiptInfo.categoryId),
      )) ||
    null

  return (
    <div className="prose prose-sm dark:prose-invert">
      {/* Hidden Inputs */}
      <input
        type="file"
        ref={cameraInputRef}
        onChange={handleFileSelect}
        accept="image/*"
        capture="environment"
        className="hidden"
      />
      <input
        type="file"
        ref={galleryInputRef}
        onChange={handleFileSelect}
        accept="image/*"
        multiple
        className="hidden"
      />

      <p>{t('Dialog.body')}</p>

      {/* --- STAGE 1: Image Selection --- */}
      {receiptInfo === null && (
        <div className="flex flex-col gap-4">
          {draftImages.length === 0 ? (
            // Empty State Buttons
            <div className="grid grid-cols-2 gap-4 h-32">
              <Button
                variant="outline"
                className="h-full flex flex-col gap-2 border-dashed"
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera className="w-8 h-8 mb-1" />
                <span>Take Photo</span>
              </Button>
              <Button
                variant="outline"
                className="h-full flex flex-col gap-2 border-dashed"
                onClick={() => galleryInputRef.current?.click()}
              >
                <ImagePlus className="w-8 h-8 mb-1" />
                <span>Gallery</span>
              </Button>
            </div>
          ) : (
            // Draft Images Preview
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {draftImages.map((img, idx) => (
                  <div
                    key={idx}
                    className="relative aspect-[3/4] rounded-md overflow-hidden border group"
                  >
                    <Image
                      src={img.blobUrl}
                      alt={`Page ${idx + 1}`}
                      fill
                      className="object-cover"
                    />
                    <button
                      onClick={() => removeDraftImage(idx)}
                      className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {/* Add More Button */}
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    className="h-full border-dashed flex flex-col gap-1"
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    <Plus className="w-5 h-5" />
                    <span className="text-xs">Add Page</span>
                  </Button>
                </div>
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={analyzeImages}
                disabled={pending}
              >
                {pending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing Receipt...
                  </>
                ) : (
                  <>Analyze Receipt ({draftImages.length} pages)</>
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* --- STAGE 2: Analysis Result --- */}
      {receiptInfo && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid gap-x-4 gap-y-4 grid-cols-1 sm:grid-cols-3 mb-6">
            {/* Preview of first image */}
            <div className="relative aspect-video sm:aspect-[3/4] rounded-lg overflow-hidden border bg-muted sm:row-span-3">
              {draftImages[0] && (
                <Image
                  src={draftImages[0].blobUrl}
                  fill
                  className="object-contain"
                  alt="Receipt Preview"
                />
              )}
              {draftImages.length > 1 && (
                <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                  +{draftImages.length - 1} more
                </div>
              )}
            </div>

            <div className="col-span-1 sm:col-span-2 space-y-3">
              <div>
                <strong className="text-xs uppercase text-muted-foreground tracking-wider block mb-1">
                  Merchant
                </strong>
                <div className="text-lg font-medium">
                  {receiptInfo.title ?? <Unknown />}
                </div>
              </div>

              <div>
                <strong className="text-xs uppercase text-muted-foreground tracking-wider block mb-1">
                  Total Amount
                </strong>
                <div className="text-2xl font-bold text-primary">
                  {group && receiptInfo.amount ? (
                    formatCurrency(
                      getCurrencyFromGroup(group),
                      receiptInfo.amount,
                      locale,
                      true,
                    )
                  ) : (
                    <span className="text-muted-foreground text-base font-normal">
                      Not found
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <strong className="text-xs uppercase text-muted-foreground tracking-wider block mb-1">
                    Date
                  </strong>
                  <div>
                    {receiptInfo.date ? (
                      formatDate(
                        new Date(`${receiptInfo.date}T12:00:00.000Z`),
                        locale,
                        { dateStyle: 'medium' },
                      )
                    ) : (
                      <Unknown />
                    )}
                  </div>
                </div>
                <div>
                  <strong className="text-xs uppercase text-muted-foreground tracking-wider block mb-1">
                    Category
                  </strong>
                  <div>
                    {receiptInfoCategory ? (
                      <div className="flex items-center text-sm">
                        <CategoryIcon
                          category={receiptInfoCategory}
                          className="inline w-4 h-4 mr-2 text-muted-foreground"
                        />
                        <span className="truncate">
                          {receiptInfoCategory.name}
                        </span>
                      </div>
                    ) : (
                      <Unknown />
                    )}
                  </div>
                </div>
              </div>

              <div>
                <strong className="text-xs uppercase text-muted-foreground tracking-wider block mb-1">
                  Items Extracted
                </strong>
                {receiptInfo.items?.length ? (
                  <Badge variant="secondary">
                    {receiptInfo.items.length} items
                  </Badge>
                ) : (
                  <span className="text-muted-foreground text-sm italic">
                    None
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setReceiptInfo(null)
                // keep images to retry or add more
              }}
            >
              Back
            </Button>
            <Button
              className="flex-[2]"
              onClick={() => {
                if (!receiptInfo || !group) return
                sessionStorage.setItem(
                  'pendingReceiptData',
                  JSON.stringify(receiptInfo),
                )
                router.push(
                  `/groups/${group.id}/expenses/create?fromReceipt=true`,
                )
              }}
            >
              Continue to Edit
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Unknown() {
  const t = useTranslations('CreateFromReceipt')
  return (
    <div className="flex gap-1 items-center text-muted-foreground italic text-sm">
      <FileQuestion className="w-3 h-3" />
      <span>{t('unknown')}</span>
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
      <DialogContent className="sm:max-w-md">
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
        <div className="px-4 pb-6 max-h-[85vh] overflow-y-auto">{children}</div>
      </DrawerContent>
    </Drawer>
  )
}
