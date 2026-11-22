import { Router } from 'express';
import {
  reviews,
  reviewStatuses,
  orders,
  menuItems,
  findCustomerByUserId,
  nextId,
  STAFF_ROLES,
} from '../data/store.js';
import { requireRole } from '../middleware/auth.js';
import { notify } from '../lib/notify.js';
import { iso } from '../lib/time.js';
import { text, number, oneOf, stringList } from '../lib/validate.js';

const router = Router();
const managerRoles = requireRole('manager', 'admin');
const customerOnly = requireRole('customer');

const round1 = (n) => Math.round(n * 10) / 10;
const COMMENT_MAX = 1000;
const RESPONSE_MAX = 500;

function serializeReview(r) {
  const itemNames = (r.menuItemIds || [])
    .map((id) => menuItems.find((m) => m.id === id)?.name)
    .filter(Boolean);
  return {
    ...r,
    menuItemNames: itemNames,
  };
}

/**
 * GET /api/reviews/summary — aggregate ratings, distribution, and satisfaction score.
 */
router.get('/summary', (req, res) => {
  const published = reviews.filter((r) => r.status === 'published');
  const total = published.length;

  if (total === 0) {
    return res.json({
      summary: {
        totalReviews: 0,
        averageRating: 0,
        averageFoodRating: 0,
        averageServiceRating: 0,
        recommendationRate: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      },
    });
  }

  const sumRating = published.reduce((sum, r) => sum + r.rating, 0);
  const sumFood = published.reduce((sum, r) => sum + (r.foodRating || r.rating), 0);
  const sumService = published.reduce((sum, r) => sum + (r.serviceRating || r.rating), 0);
  const recommended = published.filter((r) => r.rating >= 4).length;

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of published) {
    const star = Math.min(Math.max(Math.round(r.rating), 1), 5);
    distribution[star] = (distribution[star] || 0) + 1;
  }

  return res.json({
    summary: {
      totalReviews: total,
      averageRating: round1(sumRating / total),
      averageFoodRating: round1(sumFood / total),
      averageServiceRating: round1(sumService / total),
      recommendationRate: Math.round((recommended / total) * 100),
      distribution,
    },
  });
});

/**
 * GET /api/reviews/mine — the signed-in customer's own reviews.
 */
router.get('/mine', customerOnly, (req, res) => {
  const customer = findCustomerByUserId(req.user.id);
  if (!customer) return res.json({ reviews: [] });
  const mine = reviews
    .filter((r) => r.customerId === customer.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return res.json({ reviews: mine.map(serializeReview) });
});

/**
 * GET /api/reviews — public list of published reviews.
 * Staff passing ?scope=all see all statuses (published, hidden, flagged).
 */
router.get('/', (req, res) => {
  const isStaff = Boolean(req.user && STAFF_ROLES.includes(req.user.role));
  const showAll = req.query.scope === 'all' && isStaff;

  let list = reviews.filter((r) => (showAll ? true : r.status === 'published'));

  if (req.query.menuItemId) {
    list = list.filter((r) => (r.menuItemIds || []).includes(req.query.menuItemId));
  }
  if (req.query.rating) {
    const rNum = Number(req.query.rating);
    if (Number.isInteger(rNum)) list = list.filter((r) => r.rating === rNum);
  }
  if (req.query.minRating) {
    const minNum = Number(req.query.minRating);
    if (!Number.isNaN(minNum)) list = list.filter((r) => r.rating >= minNum);
  }

  const sort = req.query.sort || 'newest';
  if (sort === 'highest') list.sort((a, b) => b.rating - a.rating || b.createdAt.localeCompare(a.createdAt));
  else if (sort === 'lowest') list.sort((a, b) => a.rating - b.rating || b.createdAt.localeCompare(a.createdAt));
  else list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return res.json({ reviews: list.map(serializeReview) });
});

/**
 * POST /api/reviews — submit a verified customer review for a fulfilled/paid order.
 */
router.post('/', customerOnly, (req, res) => {
  const customer = findCustomerByUserId(req.user.id);
  if (!customer) return res.status(400).json({ error: 'Customer profile required to submit a review.' });

  const body = req.body || {};
  const { orderId, rating, foodRating, serviceRating } = body;

  if (!orderId) return res.status(400).json({ error: 'Order ID is required.' });

  const order = orders.find((o) => o.id === orderId);
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  if (order.customerId !== customer.id) {
    return res.status(403).json({ error: 'You can only review your own orders.' });
  }

  const isFulfilled = ['served', 'closed'].includes(order.status);
  if (!isFulfilled) {
    return res.status(400).json({ error: 'You can only review an order that has been served or closed.' });
  }

  if (reviews.some((r) => r.orderId === orderId)) {
    return res.status(409).json({ error: 'You have already submitted a review for this order.' });
  }

  const numRating = number(rating, 'Rating', { min: 1, max: 5, message: 'Rating must be a whole number between 1 and 5.' });
  if (!Number.isInteger(numRating)) {
    return res.status(400).json({ error: 'Rating must be a whole number between 1 and 5.' });
  }

  const numFood = foodRating !== undefined
    ? number(foodRating, 'Food rating', { min: 1, max: 5, message: 'Food rating must be between 1 and 5.' })
    : numRating;
  const numService = serviceRating !== undefined
    ? number(serviceRating, 'Service rating', { min: 1, max: 5, message: 'Service rating must be between 1 and 5.' })
    : numRating;

  const comment = text(body.comment, 'Comment', { max: COMMENT_MAX, multiline: true }) ?? '';
  const tags = stringList(body.tags, 'Tags', { maxItems: 10, maxLength: 30 }) ?? [];

  const rawItemIds = Array.isArray(body.menuItemIds) ? body.menuItemIds : [];
  const validOrderMenuItemIds = order.items.map((i) => i.menuItemId);
  const menuItemIds = rawItemIds.filter((id) => validOrderMenuItemIds.includes(id));

  const review = {
    id: nextId('rev'),
    orderId: order.id,
    customerId: customer.id,
    customerName: customer.name,
    rating: numRating,
    foodRating: numFood,
    serviceRating: numService,
    comment,
    menuItemIds,
    tags,
    status: 'published',
    managerResponse: null,
    respondedAt: null,
    createdAt: iso(),
  };

  reviews.push(review);

  notify({
    role: 'manager',
    type: 'review_received',
    title: 'New customer review',
    message: `${customer.name} left a ${numRating}-star review for Order #${order.number}.`,
    link: '/staff/reviews',
  });

  return res.status(201).json({ review: serializeReview(review) });
});

/**
 * PATCH /api/reviews/:id — manager responds to review or moderates status (manager/admin).
 */
router.patch('/:id', managerRoles, (req, res) => {
  const review = reviews.find((r) => r.id === req.params.id);
  if (!review) return res.status(404).json({ error: 'Review not found.' });

  const body = req.body || {};
  const status = oneOf(body.status, 'Status', reviewStatuses);
  const managerResponse = text(body.managerResponse, 'Manager response', { max: RESPONSE_MAX, multiline: true });

  if (status !== undefined) review.status = status;
  if (managerResponse !== undefined) {
    review.managerResponse = managerResponse;
    review.respondedAt = iso();
    review.respondedBy = req.user.id;
  }

  return res.json({ review: serializeReview(review) });
});

/**
 * DELETE /api/reviews/:id — delete a review (manager/admin only).
 */
router.delete('/:id', managerRoles, (req, res) => {
  const idx = reviews.findIndex((r) => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Review not found.' });
  const [removed] = reviews.splice(idx, 1);
  return res.json({ deleted: true, id: removed.id });
});

export default router;
