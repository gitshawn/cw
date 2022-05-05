#!/usr/bin/env node
const wrangle = await import('cw/functions/AWSECSWrangleASG.js');

// Set the region for Cloud Wrangler function
const region = 'us-west-2';

const clusters = [
  'cluster01', 
  'cluster02',
  'cluster03'
];

export const cron = async (event) => {
  for (const aCluster of clusters) {
    try {
      // Run Cloud Wrangler function we've imported as 'wrangle' and wait
      await wrangle.run(region, aCluster);
        } catch (err) {
          console.error("Error", err);
      }
  }
}

cron();
