#import <Cocoa/Cocoa.h>
#import <dispatch/dispatch.h>
#include <stdint.h>

extern void trayShowWindow(uintptr_t handle);
extern void trayRequestQuit(uintptr_t handle);

@interface DevToolsTrayDelegate : NSObject
@property uintptr_t handle;
- (id)initWithHandle:(uintptr_t)handle;
- (void)showWindow:(id)sender;
- (void)quitApp:(id)sender;
@end

@implementation DevToolsTrayDelegate
- (id)initWithHandle:(uintptr_t)handle {
    self = [super init];
    if (self) {
        self.handle = handle;
    }
    return self;
}

- (void)showWindow:(id)sender {
    trayShowWindow(self.handle);
}

- (void)quitApp:(id)sender {
    trayRequestQuit(self.handle);
}
@end

static NSStatusItem *devtoolsStatusItem = nil;
static DevToolsTrayDelegate *devtoolsTrayDelegate = nil;

void setupDevToolsTray(uintptr_t handle) {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (devtoolsStatusItem != nil) {
            return;
        }

        devtoolsTrayDelegate = [[DevToolsTrayDelegate alloc] initWithHandle:handle];
        devtoolsStatusItem = [[NSStatusBar systemStatusBar] statusItemWithLength:NSVariableStatusItemLength];
        devtoolsStatusItem.button.title = @"DT";
        devtoolsStatusItem.button.toolTip = @"DevTools";

        NSMenu *menu = [[NSMenu alloc] initWithTitle:@"DevTools"];

        NSMenuItem *showItem = [[NSMenuItem alloc] initWithTitle:@"Show DevTools" action:@selector(showWindow:) keyEquivalent:@""];
        showItem.target = devtoolsTrayDelegate;
        [menu addItem:showItem];

        [menu addItem:[NSMenuItem separatorItem]];

        NSMenuItem *quitItem = [[NSMenuItem alloc] initWithTitle:@"Quit DevTools" action:@selector(quitApp:) keyEquivalent:@""];
        quitItem.target = devtoolsTrayDelegate;
        [menu addItem:quitItem];

        devtoolsStatusItem.menu = menu;
    });
}
