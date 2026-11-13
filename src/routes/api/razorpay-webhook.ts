// api/razorpay-webhook.ts
import crypto from 'crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Ensure environment variables are checked safely for TypeScript
const projectId = process.env['FIREBASE_PROJECT_ID'];
const clientEmail = process.env['FIREBASE_CLIENT_EMAIL'];
const privateKey = process.env['FIREBASE_PRIVATE_KEY'];

if (!getApps().length) {
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing Firebase Admin environment variables in server runtime.');
  }

  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const secret = process.env['RAZORPAY_WEBHOOK_SECRET'];
  const signature = req.headers['x-razorpay-signature'];

  if (!secret) {
    return res.status(500).json({ message: 'Webhook secret not configured on server' });
  }

  // 1. Verify ki request sach mein Razorpay se hi aayi hai
  const shasum = crypto.createHmac('sha256', secret);
  shasum.update(JSON.stringify(req.body));
  const digest = shasum.digest('hex');

  if (digest !== signature) {
    return res.status(400).json({ message: 'Invalid signature' });
  }

  // 2. Agar payment capture ho gayi hai, toh Firebase mein booking confirm karein
  const event = req.body.event;
  if (event === 'payment.captured') {
    const payment = req.body.payload.payment.entity;
    const notes = payment.notes || {}; // Frontend se bheji gayi booking details

    if (notes.bookingId) {
      try {
        // Check karein ki frontend ne pehle hi save toh nahi kar di
        const snapshot = await db.collection('bookings').where('id', '==', notes.bookingId).get();
        
        if (snapshot.empty) {
          // Agar low-end phone ki wajah se frontend save nahi kar paya, toh webhook save kar dega!
          await db.collection('bookings').add({
            id: notes.bookingId,
            user_id: notes.userId || null,
            name: notes.customerName || 'Customer',
            customer_name: notes.customerName || 'Customer',
            phone: payment.contact || notes.phone || '',
            email: payment.email || '',
            utr: payment.id,
            payment_method: 'razorpay_webhook',
            bookingDate: notes.bookingDate,
            category: notes.category,
            station_id: notes.category,
            screen: notes.screen || '',
            team: notes.team || '1 Player',
            selectedGame: notes.selectedGame || 'Standard',
            duration: notes.duration,
            slot: notes.slot,
            slot_time: notes.slot,
            price: payment.amount / 100,
            status: 'CONFIRMED',
            createdAt: FieldValue.serverTimestamp(),
          });
        }
      } catch (err) {
        console.error('Webhook Firestore Error:', err);
        return res.status(500).json({ error: 'Database update failed' });
      }
    }
  }

  return res.status(200).json({ status: 'ok' });
}