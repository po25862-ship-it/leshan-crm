// Only an explicit original-image review may override the heuristic matcher.
// Bind it to image bytes and the existing case identity; never to a filename.
const normalize = value => String(value || '').normalize('NFKC').replace(/\s+/g, '').replace(/臺/g, '台');

function reviewStillMatches(property, review) {
  return Boolean(property && review?.propertyId && review?.listingNo && review?.address
    && property.id === review.propertyId
    && normalize(property.listingNo) === normalize(review.listingNo)
    && normalize(property.address) === normalize(review.address));
}

function reviewedMatch(hash, entries, properties) {
  const review = entries?.[hash];
  if (!review) return null;
  const valid = /^[a-f0-9]{64}$/.test(hash) && review.sourceHash === hash
    && review.method === 'original-image-review' && review.approved === true
    && Number.isFinite(Date.parse(review.reviewedAt));
  const property = properties.find(p => p.id === review.propertyId);
  if (!valid || !reviewStillMatches(property, review)) {
    return {status:'review',score:0,reasons:['原圖核對的目標已變更，需重新確認'],reviewConflict:true};
  }
  return {status:'matched',score:100,reasons:['原圖人工核對'],propertyId:property.id,
    listingNo:property.listingNo,propertyTitle:property.title,websitePublished:property.websitePublished === true,
    reviewPin:review};
}

module.exports = {reviewStillMatches, reviewedMatch};
