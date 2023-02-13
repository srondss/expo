#import <Foundation/Foundation.h>

@interface ABI48_0_0REATransitionAnimation : NSObject

@property (nonatomic) CAAnimation *animation;
@property (nonatomic) CALayer *layer;
@property (nonatomic) NSString *keyPath;

+ (ABI48_0_0REATransitionAnimation *)transitionWithAnimation:(CAAnimation *)animation
                                              layer:(CALayer *)layer
                                         andKeyPath:(NSString *)keyPath;
- (void)play;
- (void)delayBy:(CFTimeInterval)delay;
- (CFTimeInterval)finishTime;
- (CFTimeInterval)duration;

@end
