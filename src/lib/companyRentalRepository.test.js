import { runTransaction } from "firebase/firestore";
import { uploadBytes, deleteObject } from "firebase/storage";
import { saveCompanyRental, setCompanyRentalStatus, saveRentalViewing } from "./companyRentalRepository";
import { RENTAL_FORM_DEFAULTS, rentalSavePayload } from "./companyRental";
import { updateReadCache } from "../hooks/firestoreReadCache";
jest.mock("../firebase", () => ({ db: {}, storage: {} }));
jest.mock("firebase/firestore", () => ({ collection: (...args) => ({ path: [args[0]?.path, ...args.filter(a => typeof a === "string")].filter(Boolean).join("/") }), doc: (...args) => { const path = args.length === 1 ? args[0].path + "/new-id" : [args[0]?.path, ...args.filter(a => typeof a === "string")].filter(Boolean).join("/"); return { path, id: path.split("/").pop() }; }, getDoc: jest.fn(), getDocs: jest.fn(), runTransaction: jest.fn(), serverTimestamp: () => "SERVER_TIME" }));
jest.mock("firebase/storage", () => ({ ref: (_, path) => path, uploadBytes: jest.fn(async () => {}), getDownloadURL: jest.fn(async path => "https://example.test/" + path), deleteObject: jest.fn(async () => {}) }));
jest.mock("../hooks/firestoreReadCache", () => ({ updateReadCache: jest.fn() }));
const user = { uid: "staff" }, profile = { name: "小林" };
const form = { ...RENTAL_FORM_DEFAULTS, agentName: "小林", agentUid: "staff", title: "測試", rent: 28000, street: "文青路", doorAddress: "內部門牌", viewingInstructions: "先預約" };
const original = { id: "rental", ownerUid: "staff", revision: 2, photos: [], ...rentalSavePayload(form, "available").listing };
const snap = data => ({ id: "rental", exists: () => !!data, data: () => data });
const tx = { get: jest.fn(), set: jest.fn(), update: jest.fn() };
beforeEach(() => { jest.clearAllMocks(); global.crypto = { randomUUID: () => "unique-upload" }; tx.get.mockReset(); runTransaction.mockImplementation(async (_, callback) => callback(tx)); tx.get.mockResolvedValue(snap(original)); });
test("publishes public and internal records atomically with separate fields", async () => {
  const result = await saveCompanyRental({ original, form, status: "available", photos: [], user, profile });
  expect(tx.set).toHaveBeenCalledTimes(2);
  expect(tx.set.mock.calls[0][1]).not.toHaveProperty("doorAddress");
  expect(tx.set.mock.calls[1][1].doorAddress).toBe("內部門牌");
  expect(result.rental.revision).toBe(3); expect(updateReadCache).toHaveBeenCalled();
});
test("stale revision refuses overwrite, cleans only its new unique upload, and keeps original photos", async () => {
  tx.get.mockResolvedValue(snap({ ...original, revision: 3 }));
  const photo = { id: "hash", sha256: "a".repeat(64), blob: { size: 100, type: "image/jpeg" }, size: 100, type: "image/jpeg" };
  await expect(saveCompanyRental({ original, form, status: "available", photos: [photo], user, profile })).rejects.toThrow("其他人更新");
  expect(deleteObject.mock.calls[0][0]).toContain("unique-upload.jpg");
  expect(tx.set).not.toHaveBeenCalled(); expect(updateReadCache).not.toHaveBeenCalled();
});
test("non-owner cannot save or upload any photos", async () => {
  await expect(saveCompanyRental({ original, form, status: "available", photos: [], user: { uid: "other" }, profile })).rejects.toThrow("只有");
  expect(runTransaction).not.toHaveBeenCalled(); expect(uploadBytes).not.toHaveBeenCalled();
});
test("removed original files are deleted only after successful document commit", async () => {
  const old = { ...original, photos: [{ id: "old", storagePath: "companyRentals/staff/rental/old.jpg", name: "old" }] };
  await saveCompanyRental({ original: old, form, status: "available", photos: [], user, profile });
  expect(deleteObject).toHaveBeenCalledWith("companyRentals/staff/rental/old.jpg");
  expect(deleteObject.mock.invocationCallOrder[0]).toBeGreaterThan(tx.set.mock.invocationCallOrder[1]);
});
test("a failed write never removes any original photo", async () => {
  runTransaction.mockRejectedValue(new Error("network"));
  await expect(saveCompanyRental({ original: { ...original, photos: [{ storagePath: "companyRentals/staff/rental/old.jpg" }] }, form, status: "available", photos: [], user, profile })).rejects.toThrow("network");
  expect(deleteObject).not.toHaveBeenCalled();
});
test("draft cannot switch to available with missing internal viewing instructions", async () => {
  tx.get.mockResolvedValueOnce(snap({ ...original, status: "draft" })).mockResolvedValueOnce(snap({}));
  await expect(setCompanyRentalStatus(original, "available", user)).rejects.toThrow("門牌"); expect(tx.update).not.toHaveBeenCalled();
});
test("new customer's future viewing uses today's contact date, and creates one appointment atomically", async () => {
  tx.get.mockResolvedValue(snap({ ...original, status: "available" }));
  const result = await saveRentalViewing({ rental: original, user, newName: "測試客戶", newPhone: "", date: "2030-01-01", time: "1430", notes: "" });
  expect(result.contactId).toBeDefined();
  const customer = tx.set.mock.calls[0][1], appointment = tx.set.mock.calls[1][1];
  expect(customer.lastContactDate).not.toBe("2030-01-01"); expect(customer.ownerUid).toBe("staff");
  expect(appointment.time).toBe("14:30"); expect(appointment.companyRentalId).toBe("rental");
});
test("stale availability or invalid date cannot create an appointment", async () => {
  tx.get.mockResolvedValue(snap({ ...original, status: "rented" }));
  await expect(saveRentalViewing({ rental: original, user, newName: "客戶", date: "2030-01-01", time: "9" })).rejects.toThrow("不在招租");
  expect(tx.set).not.toHaveBeenCalled();
  await expect(saveRentalViewing({ rental: original, user, newName: "客戶", date: "2030-02-30", time: "9" })).rejects.toThrow("有效日期");
});

test("responsible colleague and buyer fee update while creator stays fixed and seller fee stays internal", async () => {
  tx.get.mockResolvedValue(snap({ ...original, agentName: "原業務", agentPhone: "舊電話" }));
  const result = await saveCompanyRental({ original, form: { ...form, agentUid: "colleague-b", agentName: "新業務", agentPhone: "新電話", buyerServiceFee: "半個月", sellerServiceFee: "屋主私約 30,000" }, status: "available", photos: [], user, profile });
  const listing = tx.set.mock.calls[0][1], internal = tx.set.mock.calls[1][1];
  expect(listing.ownerUid).toBe("staff"); expect(listing.agentUid).toBe("colleague-b"); expect(listing.agentName).toBe("新業務"); expect(listing.agentPhone).toBe("新電話");
  expect(listing.buyerServiceFee).toBe("半個月"); expect(listing).not.toHaveProperty("sellerServiceFee"); expect(internal.sellerServiceFee).toBe("屋主私約 30,000");
  expect(result.rental).not.toHaveProperty("sellerServiceFee");
});

test("saving remembers equipment with the case atomically and never removes previous shared options", async () => {
  tx.get.mockResolvedValue(snap({ ...original, furniture: ["電視"], equipmentCatalog: ["洗碗機"] }));
  const result = await saveCompanyRental({ original, form: { ...form, furniture: ["冷氣"], equipmentCatalog: ["烘衣機"] }, status: "available", photos: [], user, profile });
  expect(tx.set).toHaveBeenCalledTimes(2);
  expect(result.rental.equipmentCatalog).toEqual(["洗碗機", "電視", "烘衣機", "冷氣"]);
  expect(result.rental.furniture).toEqual(["冷氣"]);
  expect(tx.set.mock.calls[1][1]).not.toHaveProperty("equipmentCatalog");
});

test("car and motorcycle data save separately with both space numbers restricted to the internal record", async () => {
  const result = await saveCompanyRental({ original, form: { ...form, parking: "坡道平面", parkMode: "另計", parkFee: 3000, motorbikeParking: "有機車位", motorbikeParkMode: "另計", motorbikeParkFee: 300, parkingNumber: "B2-17", motorbikeParkingNumber: "M28" }, status: "available", photos: [], user, profile });
  expect(result.rental).toEqual(expect.objectContaining({ parking: "坡道平面", parkFee: 3000, motorbikeParking: "有機車位", motorbikeParkFee: 300 }));
  expect(result.rental).not.toHaveProperty("parkingNumber"); expect(result.rental).not.toHaveProperty("motorbikeParkingNumber");
  expect(tx.set.mock.calls[1][1]).toEqual(expect.objectContaining({ parkingNumber: "B2-17", motorbikeParkingNumber: "M28" }));
});
