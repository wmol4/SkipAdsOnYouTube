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
let intervalID = null;
let intervalID1 = null;
let intervalID2 = null;

// Locations for observers
let vidLoc = null;

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
            playerElem.style.opacity = '0';
            videoElem.style.opacity = '0';
            console.log('[Fast Ads] Get blocked, kid');
            counter ++;
            updateBadgeText();
        }
        // Start clicking the skip ad button
        if (!intervalID1) {
            intervalID1 = setInterval(clickSkipButton, 50);
        }
        // Start skipping to the end of the ad
        if (!intervalID2) {
            intervalID2 = setInterval(skipAd, 50);
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
    let button = document.querySelector('.ytp-ad-skip-button');
    if (button && !button.disabled) {
        button.click();
    }
}

function skipAd() {
    if (videoElem.readyState >= 1 && (playerElem.classList.contains('ad-interrupting') || playerElem.classList.contains('ad-showing'))) {
        videoElem.currentTime = videoElem.duration;
    }
}

function observePlayerChanges() {
    intervalID = setInterval(speedUpAds, 100);

    // Trigger speedUpAds when playerElem's class attributes change
    playerChangesObserver = new MutationObserver(mutations => {
        speedUpAds();
    });

     playerChangesObserver.observe(playerElem, {
         attributes: true,
         attributeFilter: ['class'] // Only look for changes in the class attribute
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
            playerElem = document.querySelector('.html5-video-player');
            videoElem = document.querySelector('video');
            if (playerElem && videoElem) {
                observePlayerChanges();
                playerObserver.disconnect();
                //console.log('[Fast Ads] Player/Video found, disconnected playerObserver.');
            }
        });
        playerObserver.observe(vidLoc, {
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
            removeAds();
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
    vidLoc = document.body; // Needs to be the body because sometimes the ads load/play before the structure has settled
    if (vidLoc) {
        callback();
    } else {
        setTimeout(() => waitForBody(callback), 50);
    }
}

function mainFunction() {
    'use strict';
    if (playerChangesObserver) {
        playerChangesObserver.disconnect();
        playerChangesObserver = null;
        //console.log('[Fast Ads] Reset playerChangesObserver');
    }
    if (playerObserver) {
        playerObserver.disconnect();
        playerObserver = null;
        //console.log('[Fast Ads] Reset playerObserver');
    }
    if (adObserver) {
        adObserver.disconnect();
        adObserver = null;
        //console.log('[Fast Ads] Reset adObserver');
    }
    if (intervalID) {
        clearInterval(intervalID);
        intervalID = null;
    }

    waitForBody(bodyFunction);
}

mainFunction();

let lastPathStr = location.pathname;
let lastQueryStr = location.search;
let lastHashStr = location.hash;
function checkForURLChange() {
    if (lastPathStr !== location.pathname || lastQueryStr !== location.search || lastHashStr !== location.hash) {
        lastPathStr = location.pathname;
        lastQueryStr = location.search;
        lastHashStr = location.hash;
        mainFunction();
    }
}

// Set an interval to continuously check for URL changes
setInterval(checkForURLChange, 1000);
