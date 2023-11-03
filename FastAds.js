// ==UserScript==
// @name         Fast Ads
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Gotta go fast!
// @author       wmol4
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        none
// @run-at       document-body
// ==/UserScript==

// Misc Parameters
let playerElem = null;
let videoElem = null;
let wasMutedByAd = false;
let originalMuteState = false;

// Observers
let playerChangesObserver = null;
let playerObserver = null;
let adObserver = null;
let intervalID1 = null;
let intervalID2 = null;

// Gate flags
let isThrottled = null;
let isProcessing = false;

// Badge counter
let counter = 0;
function updateBadgeText() {
    let badgeText = null;
    if (counter < 1000) {
        badgeText = counter.toString();
    } else if (counter < 10000) {
        badgeText = Math.floor(counter / 1000) + "K";
    } else {
        badgeText = ">10K";
    }
    //chrome.runtime.sendMessage({type: "updateBadge", sendText: badgeText});
}

function speedUpAds() {
    if (isProcessing === true) { return; }
    isProcessing = true;
    if (playerElem.classList.contains('ad-interrupting') || playerElem.classList.contains('ad-showing')) {
        // If just switching from a video to an ad, hide the video/player and set isHidden to true
        if (playerElem.style.opacity === '1') {
            //console.log('[Fast Ads] Get blocked, kid');
            playerElem.style.opacity = '0';
            videoElem.style.opacity = '0';
            counter ++;
            updateBadgeText();
        }
        // Start clicking the skip ad button
        if (!intervalID1) {
            intervalID1 = setInterval(clickSkipButton, 100);
        }
        // Start skipping to the end of the ad
        if (!intervalID2) {
            intervalID2 = setInterval(skipAd, 100);
        }
        // If the video isn't muted, mute it and make note to unmute it later
        // However, if the video is muted, we don't need to do anything
        if (!videoElem.muted) {
            originalMuteState = videoElem.muted;
            videoElem.muted = true;
            wasMutedByAd = true;
        }
    } else {
        // If siwtching from an ad to a video, show the video/player and set isHidden to false
        // Also if the video wasn't muted before the ad, unmute the video
        if (playerElem.style.opacity !== '1') {
            playerElem.style.opacity = '1';
            videoElem.style.opacity = '1';
        }
        if (intervalID1) {
            clearInterval(intervalID1);
            intervalID1 = null;
        }
        if (intervalID2) {
            clearInterval(intervalID2);
            intervalID2 = null;
        }
        if (wasMutedByAd) {
            videoElem.muted = originalMuteState;
            wasMutedByAd = false;
        }
    }
    isProcessing = false;
}

function clickSkipButton() {
    // Click the skip ad button if it exists and is enabled
    const button = document.querySelector('.ytp-ad-skip-button');
    if (button && !button.disabled) {
        button.click();
    }
}

function hasAnyClass(element, classes) {
    // Check if a class from classes exists in element
    return classes.some(cls => element.classList.contains(cls));
}

function skipAd() {
    // Set currentTime to duration if metadata exists and an ad is playing
    const isMetadataLoaded = videoElem.readyState >= 1;
    const isAdPlaying = hasAnyClass(playerElem, ['ad-interrupting', 'ad-showing']);
    if (isMetadataLoaded && isAdPlaying) {
        videoElem.currentTime = videoElem.duration;
    }
}

function waitForVideo() {
    // Assumes playerElem exists, returns once videoElem exists
    videoElem = playerElem.querySelector('video');
    if (videoElem) {
        //console.log('[Fast Ads] Redefined videoElem');
        return;
    } else {
        setTimeout(() => waitForVideo(), 50);
    }
}

function observePlayerChanges() {
    // Triggers speedUpAds when playerElem changes
    // Reconnects videoElem if it disappears
    playerChangesObserver = new MutationObserver(mutations => {
        for (let mutation of mutations) {
            if (mutation.type === 'childList') {
                if (!playerElem.contains(videoElem)) {
                    //console.log('[Fast Ads] videoElem missing from playerElem');
                    waitForVideo();
                    speedUpAds();
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
}

function waitForPlayerAndObserve() {
    // Triggers observePlayerChanges when playerElem and videoElem exist
    playerElem = document.querySelector('.html5-video-player');
    videoElem = document.querySelector('video');
    if (playerElem && videoElem) {
        //console.log('[Fast Ads] Player/Video already exist.');
        observePlayerChanges();
    } else {
        playerObserver = new MutationObserver(function(mutations) {
            playerElem = playerElem || document.querySelector('.html5-video-player');
            if (playerElem) {
                waitForVideo();
                observePlayerChanges();
                playerObserver.disconnect();
                //console.log('[Fast Ads] Player/Video found, disconnected playerObserver.');
            }
        });
        playerObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
}

const adSelectors = ['#fulfilled-layout',
                     '#player-ads',
                     '#masthead-ad',
                     '#below > ytd-merch-shelf-renderer',
                     '#movie_player > div.ytp-paid-content-overlay',
                     '[target-id="engagement-panel-ads"]'
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
            //console.log(`[Fast Ads] Removing ${getElementSelector(el)}`);
            el.remove();
            counter ++;
            updateBadgeText();
        });
        setTimeout(() => {
            isThrottled = false;
            removeAds(); // Recursive calls until elementsToRemove is exhausted
        }, 100);
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

function bodyFunction() {
    waitForPlayerAndObserve();
    waitForAdsAndObserve();
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
    // Clear the interval which calls clickSkipButton
    if (intervalID1) {
        clearInterval(intervalID1);
        intervalID1 = null;
    }
    // Clear the interval which calls skipAd
    if (intervalID2) {
        clearInterval(intervalID2);
        intervalID2 = null;
    }
}

function mainFunction() {
    'use strict';
    // Clear all of the observers and intervals
    cleanUp();
    // Run the script
    waitForBody(bodyFunction);
}

mainFunction();

let lastPathStr = location.pathname;
let lastQueryStr = location.search;
let lastHashStr = location.hash;
function checkForURLChange() {
    // If the URL changes, reset/restart the script
    if (lastPathStr !== location.pathname || lastQueryStr !== location.search || lastHashStr !== location.hash) {
        lastPathStr = location.pathname;
        lastQueryStr = location.search;
        lastHashStr = location.hash;
        mainFunction();
    }
}

// Set an interval to continuously check for URL changes
setInterval(checkForURLChange, 1000);
