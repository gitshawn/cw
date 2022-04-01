import {
    ECSClient,
    ListContainerInstancesCommand,
    DescribeContainerInstancesCommand,
    UpdateContainerInstancesStateCommand
} from "@aws-sdk/client-ecs";

import { 
    AutoScalingClient, 
    TerminateInstanceInAutoScalingGroupCommand
} from "@aws-sdk/client-auto-scaling";

const drainingInstanceTimeoutSeconds = 60;

const reWrangleTimeoutSeconds = 10;

const awsconfig = {
    region: "us-west-2"
};

const ecsclient = new ECSClient(awsconfig);

const ASGClient = new AutoScalingClient(awsconfig);

const params = {
    cluster: "wheels-prod",
};

const run = async () => {

    try {
        // Get the active containerInstanceArns given the cluster name
        const containerInstances = await ecsclient.send(
            new ListContainerInstancesCommand({
                cluster: params.cluster,
                status: "ACTIVE"
            }))
        // Get the detail for those containerInstanceArns
        const describeContainerInstances = await ecsclient.send(
            new DescribeContainerInstancesCommand({
                cluster: params.cluster,
                containerInstances: containerInstances.containerInstanceArns
            }))

        //console.log(describeContainerInstances);

        let instanceWithMostAvailableResourcesID;
        let instanceWithMostAvailableResourcesAmount = 0;
        let instanceWithMostAvailableResourcesUsedAmount = 0;
        let totalAvailableResources = 0;

        // Calculate the container instance with the most available resources
        // Calculate total available resources
        // Calculate used resources per container instance 
        for (const containerInstance of describeContainerInstances.containerInstances) {

            //console.log(containerInstance.ec2InstanceId);

           const freeResourceJSON = containerInstance.remainingResources.find(remainingResources => remainingResources.name == "MEMORY");
           const freeResource = parseInt(freeResourceJSON.integerValue);
           const usedResourceJSON = containerInstance.registeredResources.find(registeredResources => registeredResources.name == "MEMORY");
           const usedResource = parseInt(usedResourceJSON.integerValue) - freeResource;
           totalAvailableResources = totalAvailableResources + freeResource;
           
           //console.log(freeResource); 
           //console.log(usedResource);

           if (freeResource > instanceWithMostAvailableResourcesAmount) {
                instanceWithMostAvailableResourcesAmount = freeResource;
                instanceWithMostAvailableResourcesUsedAmount = usedResource;
                instanceWithMostAvailableResourcesID = containerInstance.ec2InstanceId;
           }

           //console.log(totalAvailableResources)

        }

        // console.log(`The instance with the most amount of memory available is ${instanceWithMostAvailableResourcesAmount}`);

        // Calculate whether to wrangle or not
        const freeResourcesAfterWrangle = (totalAvailableResources - instanceWithMostAvailableResourcesAmount) - (instanceWithMostAvailableResourcesUsedAmount);
        if ( freeResourcesAfterWrangle > 0) {
            console.log(`We will wrangle, as we have ${freeResourcesAfterWrangle} memory available after this wrangle. This begins by draining the instance ${instanceWithMostAvailableResourcesID}`);
            // We will wrangle, drain the instance in question
            const drainingInstance = await ecsclient.send(
                new UpdateContainerInstancesStateCommand({
                    containerInstances: instanceWithMostAvailableResourcesID,
                    status: "DRAINING"
                }))
            let drainingInstanceTimeoutCounter = 0;
            // Wait until the instance has 0 running tasks 
            do {
                await new Promise(x => setTimeout(x, 1000));
                const runningTasksJSON = containerInstance.find(ec2InstanceId => ec2InstanceId == instanceWithMostAvailableResourcesID);
                const runningTasks = parseInt(runningTasksJSON.runningTasksCount);
                drainingInstanceTimeoutCounter++;
                // If we have reached draining timeout, throw an error
                if ( drainingInstanceTimeoutCounter = drainingInstanceTimeoutSeconds ) {
                    throw `Tried to wrangle but instance did not drain within timeout of ${drainingInstanceTimeoutSeconds} seconds`
                }
            } while (runningTasks != 0);
            // Terminate the instance now it has drained
            const terminatingInstance = await ASGClient.send(
                new TerminateInstanceInAutoScalingGroupCommand({
                    InstanceId: instanceWithMostAvailableResourcesID,
                    ShouldDecrementDesiredCapacity: true
                }))
            // Log the Auto Scaling Group activity that was triggered based off of the instance termination
            console.log(terminatingInstance.Activity);
            // Sleep and run this script again, as we could have more instances to wrangle    
            await new Promise(x => setTimeout(x, (reWrangleTimeoutSeconds * 1000)));
            run();

        } else {
            // We will not wrangle
            console.log(`We will not wrangle. This cluster's nodes are optimized`)
        }
    
    } catch (err) {
        console.log("Error", err);
    }

}

run();
