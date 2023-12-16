// ==UserScript==
// @name         Fast Ads2
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Gotta go fast!
// @author       wmol4
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        none
// @run-at       document-body
// ==/UserScript==

// Bookmarklet to skip video ads:
//javascript:function f(){let b=document.querySelector("[class*='ad-persistent-progress']"),p=document.querySelector(".html5-video-player"),u=new URL(document.location.href),v=document.querySelector("video");(["ad-interrupting","ad-showing"].some(e=>p.classList.contains(e))||b&&"none"!==window.getComputedStyle(b).display||p.getVideoData().video_id!==u.searchParams.get("v"))&&(v.currentTime=v.duration,new Set(document.querySelectorAll('[class*="ad-skip"] button')).forEach(e=>{e.disabled||e.click()}),setTimeout(f,250))}f();

// Misc Parameters
let playerElem = null;
let videoElem = null;
let wasMutedByAd = false;
let originalMuteState = false;

// Observers
let playerChangesObserver = null;
let playerObserver = null;
let adObserver = null;
let isListenerAdded = false;
let mainRunning = false;
let intervalID = null;

// Gate flags
let isThrottled = null;
let isProcessing = false;

let counter = 0;
function updateBadgeText() {
//     // Badge counter, only needed when used as an extension, not a
//     // tampermonkey script
//     let badgeText = null;
//     if (counter < 1000) {
//         badgeText = counter.toString();
//     } else if (counter < 10000) {
//         badgeText = Math.floor(counter / 1000) + "K";
//     } else {
//         badgeText = ">10K";
//     }
//     //chrome.runtime.sendMessage({type: "updateBadge", sendText: badgeText});
}

let timeFormatter = new Intl.DateTimeFormat('en-US',
                                            {
                                             hour: 'numeric',
                                             minute: 'numeric',
                                             second: 'numeric',
                                             hour12: false
                                            }
                                           )
function log(string) {
    console.log(`[Fast Ads] ${timeFormatter.format(new Date())}: ${string}`);
}

function hasAnyClass(element, classes) {
    // Check if a class from classes exists in element
    return classes.some(cls => element.classList.contains(cls));
}

function checkAdClass() { // First Check
    // Check if the player has class attributes "ad-interrupting" or "ad-showing"
    return hasAnyClass(playerElem, ['ad-interrupting', 'ad-showing']);
}

const vidAdSelectors = [
    "[class*='ad-player-overlay']",
    "[class*='ytp-flyout-cta']",
    ];
const vidAdSelectorString = vidAdSelectors.join(',');
function checkAdOverlay() { // Second Check
    // Check if some common ad elements exist
    return playerElem.querySelectorAll(vidAdSelectorString).length !== 0;
//     if (playerElem.querySelectorAll(vidAdSelectorString).length !== 0) { return true; }
//     return false;
}

function checkAdProgressBar() { // Third Check
    // Check if the ad progress bar is visible
    let element = playerElem.querySelector("[class*='ad-persistent-progress']")
    if (element) {
        let computedStyle = window.getComputedStyle(element);
        return computedStyle.display !== 'none';
    }
    return false;
}

function idFromURL(url, print) {
    let videoID;
    if (url.hostname.includes('youtube.com')) {
        videoID = url.searchParams.get('v');
    } else if (url.hostname.includes('youtu.be')) {
        videoID = url.pathname.split('/')[1];
    }
    if (print && !videoID) { log('Could not find URL ID'); }
    return videoID;
}

function checkVideoIDMismatch(print) { // Fourth Check
    // Check if the url's watch ID matches the player's video ID matches the video url's watch ID
    // To block ads which play a different youtube video (ad) instead of a direct ad
    let urlID = idFromURL(new URL(document.location.href), print); // Page's URL
    let playerID = idFromURL(new URL(playerElem.getVideoUrl()), print); // Video's URL
    let videoID = playerElem.getVideoData().video_id; // Video's ID
    const allIDs = [urlID, playerID, videoID].filter(id => id != null);
    if (allIDs.length <= 1 || allIDs.every((id, _, array) => id === array[0])) {
        // if 0 or 1 IDs exist, or all of the IDs are identical
        return false; // one or no IDs exist
    } else {
        if (print) {
            log(`urlID (location.href): ${urlID} | playerID (player.getVideoUrl()): ${playerID} | videoID (player.getVideoData().video_id): ${videoID}`);
        }
        return true; // mismatch in IDs
    }
}

function checkAdPlaying(print) {
    // Check if an ad is playing
    return checkAdClass() || checkAdOverlay() || checkAdProgressBar() || checkVideoIDMismatch(print);
}

function speedUpAds() {
    if (isProcessing === true) { return; }
    isProcessing = true;
    if (checkAdPlaying(false)) {
        // If just switching from a video to an ad, hide the video/player and set isHidden to true
        if (playerElem.style.opacity === '1' || videoElem.style.opacity === '1') {
            log('Get blocked, kid');
            playerElem.style.opacity = '0.2';
            videoElem.style.opacity = '0.2';
            counter ++;
            updateBadgeText();
        }
        // If the video isn't muted, mute it and make note to unmute it later
        // However, if the video is muted, we don't need to do anything
        if (!videoElem.muted) {
            originalMuteState = videoElem.muted;
            videoElem.muted = true;
            wasMutedByAd = true;
        }
        // Event listener to click skip ad button and skip to the end of the ad
        if (!isListenerAdded) {
            videoElem.addEventListener('timeupdate', onTimeUpdate);
            isListenerAdded = true;
        }
        if (!intervalID) {
            intervalID = setInterval(clickSkipButton, 250);
        }
    } else {
        // If switching from an ad to a video, show the video/player and set isHidden to false
        // Also if the video wasn't muted before the ad, unmute the video
        if (playerElem.style.opacity !== '1' || videoElem.style.opacity !== '1') {
            playerElem.style.opacity = '1';
            videoElem.style.opacity = '1';
        }
        if (wasMutedByAd) {
            videoElem.muted = originalMuteState;
            wasMutedByAd = false;
        }
        if (isListenerAdded) {
            videoElem.removeEventListener('timeupdate', onTimeUpdate);
            isListenerAdded = false;
        }
        // Only stop clicking skip button if the video is playing
        if (intervalID && !videoElem.paused && !videoElem.ended) {
            clearInterval(intervalID);
            intervalID = null;
        }
    }
    isProcessing = false;
}

function onTimeUpdate() {
    skipAd();
}

function clickSkipButton() {
    const skipButtons = document.querySelectorAll('[class*="ad-skip"] button');
    const uniqueButtons = new Set(skipButtons);

    uniqueButtons.forEach(button => {
        if (!button.disabled) {
            button.click();
            log(`Clicked ${'.' + button.className.split(' ').join('.')}`);
        }
    });
}

function skipAd() {
    // Set currentTime to duration if metadata exists and an ad is playing
    const isMetadataLoaded = videoElem.readyState >= 2;
    const isAdPlaying = checkAdPlaying(isMetadataLoaded);
    if (isMetadataLoaded && isAdPlaying) {
        videoElem.currentTime = videoElem.duration;
    }
}

function waitForVideo(callback) {
    // Assumes playerElem exists, returns once videoElem exists
    videoElem = playerElem.querySelector('video');
    if (videoElem) {
        //log('Redefined videoElem');
        callback();
    } else {
        setTimeout(() => waitForVideo(callback), 50);
    }
}

function observePlayerChanges() {
    // Triggers speedUpAds when playerElem changes
    // Reconnects videoElem if it disappears
    playerChangesObserver = new MutationObserver(mutations => {
        for (let mutation of mutations) {
            if (mutation.type === 'childList') {
                if (!playerElem.contains(videoElem)) {
                    log('videoElem missing from playerElem');
                    waitForVideo(speedUpAds);
                    //speedUpAds();
                }
            } else if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                speedUpAds();
            }
        }
    });

    playerChangesObserver.observe(playerElem, {
        attributes: true,
        attributeFilter: ['class'],
        childList: true,
        subtree: true
    });

    // Temp placement for this function
    changeLogoLink();
}

function seekEvent(e) {
    // Ensure the event doesn't fire in input fields
    if (e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'textarea') {
        return;
    }

    const video = playerElem.querySelector('video');
    if (!video) {
        return;
    }

    // A and D seek back/forward 30s
    // Q and E seek back/forward 60s
    switch (e.key) {
        case 'a': // seeking backwards 30s
            video.currentTime -= 30;
            log('Seeked -30s');
            break;
        case 'd': // seeking forward 30s
            video.currentTime += 30;
            log('Seeked +30s');
            break;
        case 'q': // seeking backwards 60s
            video.currentTime -= 60;
            log('Seeked -60s');
            break;
        case 'e': // seeking forward 60s
            video.currentTime += 60;
            log('Seeked +60s');
            break;
    }
}

function waitForPlayerAndObserve() {
    // Triggers observePlayerChanges when playerElem and videoElem exist
    playerElem = document.querySelector('.html5-video-player');
    if (playerElem) {
        waitForVideo(observePlayerChanges);
        //log('Player/Video already exist.');
    } else {
        playerObserver = new MutationObserver(function(mutations) {
            playerElem = playerElem || document.querySelector('.html5-video-player');
            if (playerElem) { // First time load
                videoElem = document.querySelector('video');
                if (videoElem){ // Fires even if the video isn't a child of player yet
                    speedUpAds();
                }
                waitForVideo(observePlayerChanges);
                playerObserver.disconnect();
                log('Player/Video found, disconnected playerObserver.');
            }
        });
        playerObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
}

const adSelectors = [
    '#fulfilled-layout',
    '#player-ads',
    '#masthead-ad',
    '[class*="ytd-merch-shelf-renderer"]',
    "[class*='ytp'][class*='paid'][class*='overlay']",
    '[target-id="engagement-panel-ads"]',
    "#dismissible[class*='banner']",
    "#dismissible[class*='brand']",
    "#main[class*='promo-renderer']",
    '[class*="branding"]:not(.html5-video-player)',
    '[class*="ytp-button"][aria-label*="products"]',
];
const adSelectorString = adSelectors.join(',');

function getElementSelector(element) {
    // Get the name of an element for logging
    if (element.id) {
        return '#' + element.id;
    } else if (element.className) {
        return '.' + element.className.split(' ').join('.');
    } else if (element.tagName) {
        return element.tagName.toLowerCase();
    }
    return 'misc ad';
}

function removeAds() {
    // Remove ads defined in adSelectors
    const elementsToRemove = document.querySelectorAll(adSelectorString);
    if (!isThrottled && elementsToRemove.length !== 0) {
        isThrottled = true;
        elementsToRemove.forEach(el => {
            if (el) {
                log(`Removing ${getElementSelector(el)}`);
                el.remove();
                counter ++;
                updateBadgeText();
            }
        });
        setTimeout(() => {
            isThrottled = false;
            removeAds(); // Recursive calls until elementsToRemove is exhausted
        }, 250);
    }
}

function waitForAdsAndObserve() {
    isThrottled = false;
    adObserver = new MutationObserver(function(mutations) {
        removeAds();
    });

    // Initial check
    removeAds();

    adObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}

function changeLogoLink() {
    // When a special promotion is going on, clicking the top left youtube
    // icon will take you back to the default home screen, not the promotional
    // homescreen (though this won't be reflected in the url).
    document.querySelectorAll("#logo a").forEach(function(el) {
        el.setAttribute('href', 'https://www.youtube.com');
        try {
            el.data.browseEndpoint.params = '';
        } catch (error) {
            // pass
        }
    });
}

function bodyFunction() {
    if (!mainRunning) {
        mainRunning = true;
        waitForPlayerAndObserve();
        waitForAdsAndObserve();
        document.addEventListener('keydown', seekEvent);

        // Sometimes an non-playing ad covers the video before anything starts playing,
        // so start clicking the skip button now
        if (!intervalID) {
            intervalID = setInterval(clickSkipButton, 250);
        }
    }
}

function waitForBody(callback) {
    // Wait for document.body to exist
    if (document.body) {
        callback();
    } else {
        setTimeout(() => waitForBody(callback), 50);
    }
}

function cleanUp() {
    counter = 0;
    // Reset the playerChangesObserver
    if (playerChangesObserver) {
        playerChangesObserver.disconnect();
        playerChangesObserver = null;
    }
    // Reset the playerObserver
    if (playerObserver) {
        playerObserver.disconnect();
        playerObserver = null;
    }
    // Reset the adObserver
    if (adObserver) {
        adObserver.disconnect();
        adObserver = null;
    }
    // Clear event listeners
    if (isListenerAdded) {
        videoElem.removeEventListener('timeupdate', onTimeUpdate);
        isListenerAdded = false;
    }
    if (intervalID) {
            clearInterval(intervalID);
            intervalID = null;
        }
    mainRunning = false;
    document.removeEventListener('keydown', seekEvent);
}

function mainFunction() {
    'use strict';
    // Clear all of the observers, intervals, event listeners
    cleanUp();
    // Run the script
    waitForBody(bodyFunction);
}

mainFunction();

function titleChange() {
    // Reset everything when the title changes
    var titleElement = document.querySelector('title');
    if (!titleElement) {
        window.setTimeout(titleChange, 500);
        return;
    }
    var resetThrottle = false;
    const observer = new MutationObserver(mutations => {
        if (!resetThrottle) {
            resetThrottle = true;
            log('Restarting');
            mainFunction();
            setTimeout(() => {
                resetThrottle = false;
            }, 5000);
        }
    });

    const config = { childList: true };
    observer.observe(titleElement, config);
}

waitForBody(titleChange);


