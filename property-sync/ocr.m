#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#import <Vision/Vision.h>

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc != 2) {
      fprintf(stderr, "usage: leshan-ocr <image>\n");
      return 2;
    }
    NSString *imagePath = [NSString stringWithUTF8String:argv[1]];
    NSImage *image = [[NSImage alloc] initWithContentsOfFile:imagePath];
    CGImageRef cgImage = [image CGImageForProposedRect:NULL context:nil hints:nil];
    if (!cgImage) {
      fprintf(stderr, "cannot decode image\n");
      return 3;
    }

    VNRecognizeTextRequest *request = [[VNRecognizeTextRequest alloc] init];
    request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
    request.recognitionLanguages = @[ @"zh-Hant", @"en-US" ];
    request.usesLanguageCorrection = YES;
    request.minimumTextHeight = 0.008;

    NSError *error = nil;
    VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:cgImage options:@{}];
    if (![handler performRequests:@[ request ] error:&error]) {
      fprintf(stderr, "OCR failed: %s\n", error.localizedDescription.UTF8String);
      return 4;
    }

    NSMutableArray *lines = [NSMutableArray array];
    for (VNRecognizedTextObservation *observation in request.results) {
      VNRecognizedText *candidate = [[observation topCandidates:1] firstObject];
      if (!candidate) continue;
      CGRect box = observation.boundingBox;
      [lines addObject:@{
        @"text": candidate.string,
        @"confidence": @(candidate.confidence),
        @"x": @(box.origin.x), @"y": @(box.origin.y),
        @"width": @(box.size.width), @"height": @(box.size.height)
      }];
    }
    NSData *json = [NSJSONSerialization dataWithJSONObject:lines options:0 error:&error];
    if (!json) {
      fprintf(stderr, "JSON failed: %s\n", error.localizedDescription.UTF8String);
      return 5;
    }
    fwrite(json.bytes, 1, json.length, stdout);
    fputc('\n', stdout);
  }
  return 0;
}
