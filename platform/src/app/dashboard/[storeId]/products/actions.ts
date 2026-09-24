"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createCategory, deleteCategory, updateCategory } from "@/server/catalog/categories";
import { deleteProductImage, makePrimaryImage, updateImageAlt, uploadProductImage } from "@/server/catalog/images";
import { adjustInventory } from "@/server/catalog/inventory";
import { saveProduct, setProductStatus } from "@/server/catalog/products";
import { AppError } from "@/server/lib/errors";
import { formValues, getRequestMeta, requireSession, toFormState, type FormState } from "@/server/web";

const MAX_PAYLOAD = 200_000;

export async function saveProductAction(storeId: string, productId: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  let savedId: string;
  try {
    const raw = form.get("payload");
    if (typeof raw !== "string" || raw.length > MAX_PAYLOAD) throw new AppError("validation", "بيانات المنتج غير صالحة.");
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new AppError("validation", "بيانات المنتج غير صالحة.");
    }
    ({ productId: savedId } = await saveProduct(session.user.id, storeId, productId, payload, await getRequestMeta()));
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath(`/dashboard/${storeId}`, "layout");
  redirect(`/dashboard/${storeId}/products/${savedId}?saved=1`);
}

export async function setProductStatusAction(storeId: string, productId: string, status: "draft" | "active" | "archived") {
  const session = await requireSession();
  await setProductStatus(session.user.id, storeId, productId, status, await getRequestMeta());
  revalidatePath(`/dashboard/${storeId}`, "layout");
  if (status === "archived") redirect(`/dashboard/${storeId}/products`);
}

export async function uploadImageAction(storeId: string, productId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  try {
    const files = form.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) throw new AppError("validation", "اختر صورة واحدة على الأقل.");
    for (const file of files) await uploadProductImage(session.user.id, storeId, productId, file, await getRequestMeta());
  } catch (err) {
    revalidatePath(`/dashboard/${storeId}/products/${productId}`);
    return toFormState(err);
  }
  revalidatePath(`/dashboard/${storeId}/products/${productId}`);
  return { ok: true, message: "تم رفع الصور." };
}

export async function deleteImageAction(storeId: string, productId: string, imageId: string) {
  const session = await requireSession();
  await deleteProductImage(session.user.id, storeId, imageId, await getRequestMeta());
  revalidatePath(`/dashboard/${storeId}/products/${productId}`);
}

export async function makePrimaryImageAction(storeId: string, productId: string, imageId: string) {
  const session = await requireSession();
  await makePrimaryImage(session.user.id, storeId, imageId);
  revalidatePath(`/dashboard/${storeId}/products/${productId}`);
}

export async function updateImageAltAction(storeId: string, productId: string, imageId: string, form: FormData) {
  const session = await requireSession();
  await updateImageAlt(session.user.id, storeId, imageId, String(form.get("alt") ?? ""));
  revalidatePath(`/dashboard/${storeId}/products/${productId}`);
}

export async function createCategoryAction(storeId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  try {
    await createCategory(
      session.user.id,
      storeId,
      { name: form.get("name"), parentId: form.get("parentId") ?? "" },
      await getRequestMeta(),
    );
  } catch (err) {
    return toFormState(err, formValues(form));
  }
  revalidatePath(`/dashboard/${storeId}/products/categories`);
  return { ok: true, message: "تمت إضافة التصنيف." };
}

export async function updateCategoryAction(storeId: string, categoryId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  try {
    await updateCategory(
      session.user.id,
      storeId,
      categoryId,
      { name: form.get("name"), parentId: form.get("parentId") ?? "" },
      await getRequestMeta(),
    );
  } catch (err) {
    return toFormState(err, formValues(form));
  }
  revalidatePath(`/dashboard/${storeId}/products/categories`);
  return { ok: true, message: "تم الحفظ." };
}

export async function deleteCategoryAction(storeId: string, categoryId: string) {
  const session = await requireSession();
  await deleteCategory(session.user.id, storeId, categoryId, await getRequestMeta());
  revalidatePath(`/dashboard/${storeId}/products/categories`);
}

export async function adjustInventoryAction(storeId: string, variantId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  try {
    const { onHand } = await adjustInventory(
      session.user.id,
      storeId,
      variantId,
      { mode: form.get("mode"), quantity: form.get("quantity"), note: form.get("note") ?? "" },
      await getRequestMeta(),
    );
    revalidatePath(`/dashboard/${storeId}/inventory`);
    return { ok: true, message: `الكمية الآن ${onHand}.` };
  } catch (err) {
    return toFormState(err);
  }
}
