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
let maxRateFound = null;
let playerElem = null;
let videoElem = null;
let intervalID = null;
let isHidden = false;
let opacityVal = '0';

// Observers
let playerChangesObserver = null;
let playerObserver = null;
let adObserver = null;

// Locations for observers
let vidLoc = null;
let adLoc = null;

function trySkipAd() {
    let skipButton = document.querySelector('.ytp-ad-skip-button');
    if (skipButton && !skipButton.disabled) {
        skipButton.click();
        console.log('[Fast Ads] HUGE ad skip');
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
            intervalID = setInterval(trySkipAd, 100);
        }
        hideElements();
        videoElem.playbackRate = maxRateFound;
        videoElem.muted = true;
        //playerElem.mute();
    } else {
        closeInterval();
        showElements();
        videoElem.playbackRate = 1;
        videoElem.muted = false; // Unmute the video
        //playerElem.unMute();
    }
}

function waitForVidLocAndObserve(callback) {
    vidLoc = document.body;
    if (vidLoc) {
        callback();
    } else {
        setTimeout(() => waitForVidLocAndObserve(callback), 10);
    }
}

function waitForAdLocAndObserve(callback) {
    adLoc = document.querySelector('#page-manager');
    if (adLoc) {
        callback();
    } else {
        setTimeout(() => waitForAdLocAndObserve(callback), 10);
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
        playerObserver.observe(vidLoc, {
            childList: true,
            subtree: true
        });
    }
}

const adSelectors = ['#fulfilled-layout', '#player-ads', '#masthead-ad', '#below > ytd-merch-shelf-renderer', '#movie_player > div.ytp-paid-content-overlay']; // Add all your ad selectors here
// const adSelectors = ['#fulfilled-layout', '#player-ads', '#masthead-ad', '#rendering-content > ytd-video-display-full-buttoned-renderer', '[target-id="engagement-panel-ads"]', '#panels', '#contents > ytd-ad-slot-renderer']
function removeAds() {
    adSelectors.forEach(selector => {
        let adElem = adLoc.querySelector(selector);
        if (adElem) {
            adElem.remove();
            console.log('[Fast Ads] Removed ' + selector);
        }
    });
}
function waitForAdsAndObserve() {
    adObserver = new MutationObserver(function(mutations) {
        removeAds();
    });

    // Initial check
    removeAds();

    adObserver.observe(adLoc, {
        childList: true,
        subtree: true
    });
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

    waitForVidLocAndObserve(waitForPlayerAndObserve);
    waitForAdLocAndObserve(waitForAdsAndObserve);
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
        //console.log('[Fast Ads] URL change detected');
        mainFunction();
    }
}

// Run script logic immediately for initial page load
mainFunction();

// Set an interval to continuously check for URL changes
setInterval(checkForURLChange, 1000);
