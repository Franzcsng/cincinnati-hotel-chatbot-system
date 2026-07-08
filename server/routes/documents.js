import { Router } from 'express'
import multer from 'multer'
import { randomUUID } from 'crypto'
import { supabase } from '../lib/supabaseClient.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new Error('Only PDF files are allowed'))
      return
    }
    cb(null, true)
  },
})

const router = Router()

router.post(
  '/upload',
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message })
      }
      next()
    })
  },
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file provided' })
    }

    const bucket = process.env.SUPABASE_STORAGE_BUCKET_NAME
    const documentId = randomUUID()
    const storagePath = `${documentId}-${req.file.originalname}`

    try {
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(storagePath, req.file.buffer, {
          contentType: 'application/pdf',
          upsert: false,
        })

      if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message}`)
      }

      const { data: activeDocument, error: activeLookupError } = await supabase
        .from('documents')
        .select('id')
        .eq('is_active', true)
        .maybeSingle()

      if (activeLookupError) {
        throw new Error(`Failed to look up active document: ${activeLookupError.message}`)
      }

      if (activeDocument) {
        const { error: deleteChunksError } = await supabase
          .from('document_chunks')
          .delete()
          .eq('document_id', activeDocument.id)

        if (deleteChunksError) {
          throw new Error(`Failed to delete previous document chunks: ${deleteChunksError.message}`)
        }

        const { error: deactivateError } = await supabase
          .from('documents')
          .update({ is_active: false })
          .eq('id', activeDocument.id)

        if (deactivateError) {
          throw new Error(`Failed to deactivate previous document: ${deactivateError.message}`)
        }
      }

      const { data: newDocument, error: insertError } = await supabase
        .from('documents')
        .insert({
          id: documentId,
          filename: req.file.originalname,
          storage_path: storagePath,
          uploaded_at: new Date().toISOString(),
          is_active: true,
        })
        .select()
        .single()

      if (insertError) {
        throw new Error(`Failed to create document record: ${insertError.message}`)
      }

      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(storagePath, 60 * 60)

      if (signedUrlError) {
        throw new Error(`Error generating signed URL: ${signedUrlError.message}`)
      }

      const webhookUrl = process.env.PDF_UPLOAD_WEBHOOK_URL
      if (webhookUrl) {
        try {
          const webhookResponse = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              document_id: newDocument.id,
              filename: newDocument.filename,
              storage_path: newDocument.storage_path,
              signed_url: signedUrlData.signedUrl,
            }),
          })

          if (!webhookResponse.ok) {
            console.error(`PDF upload webhook responded with status ${webhookResponse.status}`)
          }
        } catch (webhookError) {
          console.error('Failed to call PDF upload webhook:', webhookError)
        }
      }

      res.status(201).json({ document: newDocument })
    } catch (error) {
      console.error('PDF upload failed:', error)
      res.status(500).json({ error: error.message })
    }
  },
)

export default router
