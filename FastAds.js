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
let isHidden = false;
let opacityVal = '0';
let wasMutedByAd = false;
let originalMuteState = false;

// Observers
let playerChangesObserver = null;
let playerObserver = null;
let adObserver = null;
let buttonObserver = null;

// Locations for observers
let vidLoc = null;
let adLoc = null;

// Gate flags
let isThrottled = null;
let isSkipping = null;
let isClicking = null;

function trySkipAd() {
    let skipButton = document.querySelector('.ytp-ad-skip-button');
    if (skipButton && !skipButton.disabled) {
        skipButton.click();
        console.log('[Fast Ads] HUGE ad skip');
    }
}

function adPlaying() {
    if (isHidden === false || playerElem.style.opacity === '1') {
        playerElem.style.opacity = opacityVal;
        videoElem.style.opacity = opacityVal;
        console.log('[Fast Ads] Get blocked, kid');
        isHidden = true;
    }
}

function vidPlaying() {
    if (isHidden === true || playerElem.style.opacity !== '1') {
        playerElem.style.opacity = '1';
        videoElem.style.opacity = '1';
        isHidden = false;
        if (wasMutedByAd) {
            videoElem.muted = originalMuteState;
            wasMutedByAd = false;
        }
    }
}

function waitForMetadata() {
    return new Promise((resolve, reject) => {
        function checkReadyState() {
            if (videoElem.readyState >= 1) {
                resolve();
            } else {
                setTimeout(checkReadyState, 10);
            }
        }
        checkReadyState();
    });
}

async function skipToEnd() {
    await waitForMetadata();
    if (playerElem.classList.contains('ad-interrupting') && !isSkipping) {
        isSkipping = true;
        const duration = videoElem.duration;
        videoElem.currentTime = duration;
        console.log(`[Fast Ads] Full Skipped ${Math.floor(duration)}s ad`);
        setTimeout(() => {
            isSkipping = false;
            skipToEnd();
        }, 250);
    }
}

function speedUpAds() {
    if (playerElem.classList.contains('ad-interrupting')) {
        adPlaying();
        skipToEnd();
        if (!videoElem.muted) {
            originalMuteState = videoElem.muted;
            videoElem.muted = true;
            wasMutedByAd = true;
        }
    } else {
        vidPlaying();
    }
}

function waitForVidLoc(callback) {
    vidLoc = document.body; // Needs to be the body because sometimes the ads load/play before the structure has settled
    if (vidLoc) {
        callback();
    } else {
        setTimeout(() => waitForVidLoc(callback), 50);
    }
}

function clickSkipButton(button) {
    if (button && !button.disabled && !isClicking) {
        isClicking = true;
        button.click();
        if (playerElem.classList.contains('ad-interrupting')) { console.log('[Fast Ads] HUGE ad skip'); }
        setTimeout(() => {
            isClicking = false;
        }, 250);
    }
}

function observeButtonChanges() {
    isClicking = false;
    // Initial check
    let skipButton = document.querySelector('.ytp-ad-skip-button');
    clickSkipButton(skipButton);
    buttonObserver = new MutationObserver(function(mutations) {
        skipButton = skipButton || document.querySelector('.ytp-ad-skip-button');
        clickSkipButton(skipButton);
    });
    buttonObserver.observe(playerElem, { childList: true, subtree: true });
}

function observePlayerChanges() {
    isSkipping = false;
    observeButtonChanges(); // Start looking for the "skip ad" button
    speedUpAds(); // Initial check
    videoElem.addEventListener('playing', speedUpAds);

    playerChangesObserver = new MutationObserver(function(mutations) {
         speedUpAds();
     });

     // Start observing
     playerChangesObserver.observe(playerElem, {
         attributes: true,
         attributeFilter: ['class'] // Only look for changes in the class attribute
     });
}

function waitForPlayerAndObserve() {
    playerElem = document.querySelector('.html5-video-player');
    videoElem = document.querySelector('video');
    if (playerElem && videoElem) {
        console.log('[Fast Ads] Player/Video already exist.');
        observePlayerChanges();
    } else {
        playerObserver = new MutationObserver(function(mutations) {
            playerElem = playerElem || document.querySelector('.html5-video-player');
            videoElem = videoElem || document.querySelector('video');
            if (playerElem && videoElem) {
                observePlayerChanges();
                playerObserver.disconnect();
                console.log('[Fast Ads] Player/Video found, disconnected playerObserver.');
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
                     'body > ytd-app > ytd-popup-container > tp-yt-paper-dialog',
                     '[target-id="engagement-panel-ads"]'
                     ]
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
            console.log(`[Fast Ads] Removing ${getElementSelector(el)}`);
            el.remove();
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

function mainFunction() {
    'use strict';
    if (videoElem) {
        videoElem.removeEventListener('playing', speedUpAds);
    }
    if (playerChangesObserver) {
        playerChangesObserver.disconnect();
        playerChangesObserver = null;
    }
    if (playerObserver) {
        playerObserver.disconnect();
        playerObserver = null;
    }
    if (adObserver) {
        adObserver.disconnect();
        adObserver = null;
    }
    if (buttonObserver) {
        buttonObserver.disconnect();
        buttonObserver = null;
    }

    waitForVidLoc(waitForPlayerAndObserve);
    waitForAdsAndObserve();
}

mainFunction();

let lastPathStr = location.pathname;
let lastQueryStr = location.search;
let lastHashStr = location.hash;

// Polling logic to detect URL changes
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
