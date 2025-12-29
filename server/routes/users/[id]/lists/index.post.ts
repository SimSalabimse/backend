import { useAuth } from '../../../../utils/auth';
import { query } from '../../../../utils/prisma';
import { z } from 'zod';

const listItemSchema = z.object({
  tmdb_id: z.string(),
  type: z.enum(['movie', 'tv']),
});

const createListSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(255).optional().nullable(),
  items: z.array(listItemSchema).optional(),
  public: z.boolean().optional(),
});

export default defineEventHandler(async (event) => {
  const userId = event.context.params?.id;
  const session = await useAuth().getCurrentSession();

  if (session.user !== userId) {
    throw createError({
      statusCode: 403,
      message: 'Cannot modify user other than yourself',
    });
  }

  const body = await readBody(event);

  let parsedBody;
  try {
    parsedBody = typeof body === 'string' ? JSON.parse(body) : body;
  } catch (error) {
    throw createError({
      statusCode: 400,
      message: 'Invalid request body format',
    });
  }

  const validatedBody = createListSchema.parse(parsedBody);

  // 1️⃣ Create the list
  const insertListResult = await query(
    `INSERT INTO lists (user_id, name, description, public)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, validatedBody.name, validatedBody.description || null, validatedBody.public || false]
  );

  const newList = insertListResult.rows[0];

  // 2️⃣ Insert items if provided
  if (validatedBody.items?.length) {
    for (const item of validatedBody.items) {
      await query(
        `INSERT INTO list_items (list_id, tmdb_id, type)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [newList.id, item.tmdb_id, item.type]
      );
    }
  }

  // 3️⃣ Fetch list with items
  const finalListResult = await query(
    `SELECT l.*, json_agg(li.*) FILTER (WHERE li.id IS NOT NULL) AS list_items
     FROM lists l
     LEFT JOIN list_items li ON li.list_id = l.id
     WHERE l.id = $1
     GROUP BY l.id`,
    [newList.id]
  );

  return {
    list: finalListResult.rows[0],
    message: 'List created successfully',
  };
});
