# Garenta API Integration with Parallel Requests

## Overview

This project implements a car rental search interface that integrates with Garenta's API. The implementation includes a parallel request mechanism to solve the Netlify 10-second timeout issue when searching for vehicles in cities with many branches.

## Parallel Request Implementation

### Problem

Netlify serverless functions have a 10-second execution time limit. When searching for vehicles in cities with many branches, sequential API calls to each branch can exceed this limit, causing the function to time out.

### Solution

The solution implements a batch processing approach with parallel requests:

1. **Batch Processing**: Branches are processed in small batches (default: 5 branches per batch) to avoid overwhelming the API.

2. **Parallel Requests**: Within each batch, requests to all branches are made in parallel using `Promise.allSettled`.

3. **Timeout Management**: Each individual branch request has a 3-second timeout to prevent slow branches from blocking the entire process.

4. **Early Termination**: The function monitors execution time and stops processing new batches if approaching the 8-second mark to ensure the function can return results before Netlify's 10-second limit.

### Performance Benefits

- **Reduced Total Execution Time**: Processing branches in parallel significantly reduces the total time needed to search all branches.

- **Graceful Degradation**: If there are too many branches to process within the time limit, the function will return results from the branches it was able to process.

- **Timeout Handling**: Individual branch timeouts prevent a single slow branch from causing the entire function to fail.

## Performance Metrics

The implementation includes performance metrics in the API response:

- **Execution Time**: Total time taken to process all branch requests (in milliseconds).

- **Batch Size**: Number of branches processed in parallel in each batch.

- **Branch Statistics**: Total branches, successfully processed branches, and failed branches.

## UI Features

The user interface displays performance metrics to help users understand the search process:

- **Execution Time**: Shows how long the search took in seconds.

- **Branch Coverage**: Indicates how many branches were successfully searched out of the total available.

## Technical Implementation

### Key Components

1. **Batch Processing Function**: Processes a subset of branches in parallel.

2. **Promise.allSettled**: Used to handle multiple concurrent requests and gracefully handle failures.

3. **Execution Time Monitoring**: Tracks the total execution time to avoid exceeding Netlify's limits.

4. **Performance Metrics**: Collects and returns metrics about the search process.

## Future Improvements

- **Dynamic Batch Sizing**: Adjust batch size based on the number of branches and historical performance data.

- **Caching**: Implement caching for branch data to reduce redundant API calls.

- **Progressive Loading**: Update the UI as each batch completes rather than waiting for all batches.