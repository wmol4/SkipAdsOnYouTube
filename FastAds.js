// ==UserScript==
// @name         Fast Ads
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Gotta go fast!
// @author       wmol4
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        none
// @run-at       document-start
// ==/UserScript==

let maxRateFound = null;
let playerElem = null;
let videoElem = null;
let intervalID = null;
let isHidden = false;
let opacityVal = '0'
let intervals = {};

let playerChangesObserver = null;
let playerObserver = null;
let adChangesObservers = new Set();
let adObserver = null;

function trySkipAd() {
    let skipButton = document.querySelector('.ytp-ad-skip-button');
    if (skipButton && !skipButton.disabled) {
        skipButton.click();
        console.log('[Fast Ads] HUGE skip');
    }
}

function hideElements() {
    if (isHidden === false || playerElem.style.opacity === '1') {
        playerElem.style.opacity = opacityVal;
        videoElem.style.opacity = opacityVal;
        console.log('[Fast Ads] Get blocked, kid');
        isHidden = true;
    }
}

function showElements() {
    if (isHidden === true || playerElem.style.opacity !== '1') {
        playerElem.style.opacity = '1';
        videoElem.style.opacity = '1';
        //console.log('[Fast Ads] Get unblocked, champ');
        isHidden = false;
    }
}

function closeInterval() {
    if (intervalID) {
        clearInterval(intervalID); // Stop clicking the skip ad button
        intervalID = null;
    }
}

function getMaxRate() {
    let rate = 16;
    const decrement = 1;
    while (rate > 1) { // Ensure rate doesn't go below 1
        try {
            videoElem.playbackRate = rate;
            maxRateFound = rate;
            //console.log('[Fast Ads] Max Speed: ' + maxRateFound);
            break;
        } catch (error) {
            // Error when setting unsupported playback rate, just continue with the loop
        }
        rate -= decrement;
    }
    if (maxRateFound === null) {
        maxRateFound = 1;
    }
}

function speedUpAds() {
    if (playerElem.classList.contains('ad-interrupting')) {
        if (maxRateFound === null) { // first call to set isInterrupting and maxRateFound
            getMaxRate();
        }
        if (intervalID === null) {
            // Start clicking the skip ad button every 100ms, set the ID to close later
            intervalID = setInterval(trySkipAd, 50);
        }
        hideElements();
        videoElem.playbackRate = maxRateFound;
        videoElem.muted = true;
        playerElem.mute();
    } else {
        showElements();
        closeInterval();
        videoElem.muted = false; // Unmute the video
        playerElem.unMute();
        videoElem.playbackRate = 1;
    }
}

function waitForBodyAndObserve(callback) {
    if (document.body) {
        callback();
    } else {
        setTimeout(() => waitForBodyAndObserve(callback), 10);
    }
}

function observePlayerChanges() {
    speedUpAds();
    playerChangesObserver = new MutationObserver(function(mutationsList, obs) {
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
        observePlayerChanges();
    } else {
        playerObserver = new MutationObserver(function(mutations) {
            playerElem = playerElem || document.querySelector('.html5-video-player');
            videoElem = videoElem || document.querySelector('video');
            if (playerElem && videoElem) {
                observePlayerChanges();
                playerObserver.disconnect();
            }
        });
        playerObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
}

function observeAdChanges(adElem, selector) {
    if (!adElem) return;

    adElem.remove();

    const observer = new MutationObserver(function(mutationsList, obs) {
        if (!document.body.contains(adElem)) {
            obs.disconnect();
            adChangesObservers.delete(obs)
        } else {
            adElem.remove();
            obs.disconnect();
            adChangesObservers.delete(obs)
        }
    });

    adChangesObservers.add(observer)
    observer.observe(adElem, {
        attributes: true,
        childList: true,
        subtree: true
    });

    console.log('[Fast Ads] Removed ' + selector);
}

const adSelectors = ['#fulfilled-layout', '#player-ads', '#masthead-ad']; // Add all your ad selectors here
function waitForAdsAndObserve() {
    const observedSelectors = new Set();

    adObserver = new MutationObserver(function(mutations) {
        adSelectors.forEach(selector => {
            let adElem = document.querySelector(selector);
            if (adElem && !observedSelectors.has(selector)) {
                observeAdChanges(adElem, selector);
                observedSelectors.add(selector); // Mark the selector as observed
            }
        });
    });

    // Initial check and removal
    adSelectors.forEach(selector => {
        let adElem = document.querySelector(selector);
        if (adElem) {
            observeAdChanges(adElem, selector);
            observedSelectors.add(selector);
        }
    });

    adObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}

function mainFunction() {
    'use strict';

    if (playerChangesObserver) {
        playerChangesObserver.disconnect();
        playerChangesObserver = null;
        console.log('[Fast Ads] Reset playerChangesObserver');
    }
    if (playerObserver) {
        playerObserver.disconnect();
        playerObserver = null;
        console.log('[Fast Ads] Reset playerObserver');
    }

    // Log for Set of observers
    if (adChangesObservers.size > 0) {
        console.log(`[Fast Ads] Disconnecting and clearing ${adChangesObservers.size} adChangesObservers`);
        adChangesObservers.forEach(obs => obs.disconnect());
        adChangesObservers.clear();
    }

    if (adObserver) {
        adObserver.disconnect();
        adObserver = null;
        console.log('[Fast Ads] Reset adObserver');
    }

    waitForBodyAndObserve(waitForPlayerAndObserve);
    waitForBodyAndObserve(waitForAdsAndObserve);
}

let lastPathStr = location.pathname;
let lastQueryStr = location.search;
let lastHashStr = location.hash;

// Polling logic to detect URL changes
function checkForURLChange() {
    if (lastPathStr !== location.pathname || lastQueryStr !== location.search || lastHashStr !== location.hash) {
        lastPathStr = location.pathname;
        lastQueryStr = location.search;
        lastHashStr = location.hash;
        console.log('[Fast Ads] URL change detected');
        mainFunction();
    }
}

// Run script logic immediately for initial page load
mainFunction();

// Set an interval to continuously check for URL changes
setInterval(checkForURLChange, 250);
