import { formatPropertyLease, propertyRentFeeNote, propertyRentalIncome, propertyLeaseEnded } from "./propertyRentalIncome";

const FONT = '"PingFang TC", "Microsoft JhengHei", sans-serif';
function text(ctx, value, x, y, maxWidth, size, weight = 600) {
  while (size > 16) { ctx.font = `${weight} ${size}px ${FONT}`; if (ctx.measureText(value).width <= maxWidth) break; size--; }
  let shown = value;
  while (ctx.measureText(shown).width > maxWidth && shown.length > 1) shown = shown.slice(0, -1);
  if (shown !== value) shown = `${shown.slice(0, -1)}…`;
  ctx.fillText(shown, x, y);
}
export async function renderPropertyRentalPng({ property, aspectRatio = 2.6 }) {
  if (typeof document === "undefined") throw new Error("租金標示需要在瀏覽器中製作");
  await document.fonts?.ready;
  const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = Math.max(140, Math.round(1200 / aspectRatio));
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("瀏覽器無法製作租金標示");
  const W = canvas.width, H = canvas.height, banner = aspectRatio >= 4;
  ctx.fillStyle = "#EDF5EF"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = "#1B513C";
  const rent = propertyRentalIncome(property).monthlyRent;
  const amount = rent === null ? "租金待確認" : rent.toLocaleString("zh-TW", { maximumFractionDigits: 2 });
  const expired = propertyLeaseEnded(property), lease = formatPropertyLease(property).replace("（表載租期已到期，續租待確認）", "");
  if (banner) {
    text(ctx, "月租金", 24, H * .23, W * .42, H * .16);
    text(ctx, rent === null ? amount : `${amount} 元／月`, 24, H * .68, W * .43, H * .36, 850);
    text(ctx, propertyRentFeeNote(property), 24, H * .90, W * .43, H * .15);
    text(ctx, "租期", W * .49, H * .27, W * .49, H * .17);
    text(ctx, lease, W * .49, H * (expired ? .55 : .68), W * .49, H * .28, 750);
    if (expired) text(ctx, "表載租期已到期・續租待確認", W * .49, H * .90, W * .49, H * .17, 750);
  } else {
    text(ctx, "月租金", W * .04, H * .17, W * .92, H * .14);
    text(ctx, rent === null ? amount : `${amount} 元／月`, W * .04, H * (expired ? .45 : .52), W * .92, H * .32, 850);
    text(ctx, propertyRentFeeNote(property), W * .04, H * (expired ? .63 : .71), W * .92, H * .12);
    text(ctx, `租期 ${lease}`, W * .04, H * (expired ? .79 : .92), W * .92, H * .14, 750);
    if (expired) text(ctx, "表載租期已到期・續租待確認", W * .04, H * .95, W * .92, H * .12, 750);
  }
  const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("租金標示製作失敗")), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}
